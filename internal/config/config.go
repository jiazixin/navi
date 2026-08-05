// Package config loads and validates the Navi main configuration file.
package config

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

const (
	// ThemeDefault follows the operating system color scheme.
	ThemeDefault = "default"

	// BackgroundPatternMeridianGrid is the default background pattern.
	BackgroundPatternMeridianGrid = "meridian-grid"

	// WebSearchBaidu is the default external search provider.
	WebSearchBaidu = "baidu"
)

var (
	themes = map[string]struct{}{
		"default": {}, "navy-blossom": {}, "mint-tide": {}, "moss-court": {},
		"tea-mist": {}, "amber-tide": {}, "sunny-coast": {}, "violet-lime": {},
	}
	backgroundPatterns = map[string]struct{}{
		"none": {}, "meridian-grid": {}, "orbital-rings": {}, "pisces": {}, "sagittarius": {},
		"roman-meander": {}, "rose-window": {}, "eight-point-star": {}, "star-trails": {},
	}
	webSearchProviders = map[string]struct{}{
		"baidu": {}, "google": {}, "yandex": {}, "bing": {}, "github": {}, "chatgpt": {},
		"claude": {}, "gemini": {},
	}
)

// Config is the validated process configuration with paths resolved from its file.
type Config struct {
	Path              string           `yaml:"-"`
	StorageDir        string           `yaml:"storage"`
	Theme             string           `yaml:"theme"`
	BackgroundPattern string           `yaml:"background_pattern"`
	WebSearch         string           `yaml:"web_search"`
	Server            ServerConfig     `yaml:"server"`
	Health            HealthConfig     `yaml:"health"`
	Logging           LoggingConfig    `yaml:"logging"`
	Catalog           CatalogConfig    `yaml:"catalog"`
	Navigation        NavigationConfig `yaml:"navigation"`
	Favicon           FaviconConfig    `yaml:"favicon"`
}

// ServerConfig controls the inbound HTTP server.
type ServerConfig struct {
	Listen            string        `yaml:"listen"`
	Port              int           `yaml:"port"`
	ReadHeaderTimeout time.Duration `yaml:"read_header_timeout"`
	ReadTimeout       time.Duration `yaml:"read_timeout"`
	WriteTimeout      time.Duration `yaml:"write_timeout"`
	IdleTimeout       time.Duration `yaml:"idle_timeout"`
	ShutdownTimeout   time.Duration `yaml:"shutdown_timeout"`
}

// HealthConfig configures the health endpoint.
type HealthConfig struct {
	URI string `yaml:"uri"`
}

// LoggingConfig controls structured logging.
type LoggingConfig struct {
	Level           string `yaml:"level"`
	Format          string `yaml:"format"`
	AccessLog       bool   `yaml:"access_log"`
	LogHealthChecks bool   `yaml:"log_health_checks"`
}

// CatalogConfig controls YAML catalog loading and watching.
type CatalogConfig struct {
	Path           string        `yaml:"path"`
	Watch          bool          `yaml:"watch"`
	ReloadDebounce time.Duration `yaml:"reload_debounce"`
}

// NavigationConfig controls private and public destination probes.
type NavigationConfig struct {
	PrivateProbeTimeout time.Duration `yaml:"private_probe_timeout"`
	PublicProbeTimeout  time.Duration `yaml:"public_probe_timeout"`
	ProbeCacheTTL       time.Duration `yaml:"probe_cache_ttl"`
	MaxConcurrentProbes int           `yaml:"max_concurrent_probes"`
}

// FaviconConfig controls favicon discovery and cache maintenance.
type FaviconConfig struct {
	FetchTimeout    time.Duration `yaml:"fetch_timeout"`
	RefreshInterval time.Duration `yaml:"refresh_interval"`
	MaxFileBytes    int64         `yaml:"max_file_bytes"`
	Workers         int           `yaml:"workers"`
}

// LookupEnv is compatible with os.LookupEnv and permits deterministic tests.
type LookupEnv func(string) (string, bool)

// Load selects, loads, and validates the main configuration file.
func Load(args []string, lookupEnv LookupEnv) (Config, error) {
	flagSet := flag.NewFlagSet("navi", flag.ContinueOnError)
	flagSet.SetOutput(io.Discard)
	filePath := flagSet.String("f", "", "main configuration file")
	if err := flagSet.Parse(args); err != nil {
		return Config{}, fmt.Errorf("parse flags: %w", err)
	}
	if flagSet.NArg() > 0 {
		return Config{}, fmt.Errorf("unexpected argument %q", flagSet.Arg(0))
	}

	path, err := selectPath(*filePath, lookupEnv)
	if err != nil {
		return Config{}, err
	}
	return LoadFile(path)
}

// LoadFile loads and validates a specific main configuration file.
func LoadFile(path string) (Config, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return Config{}, fmt.Errorf("resolve configuration path %q: %w", path, err)
	}
	absPath = filepath.Clean(absPath)

	file, err := os.Open(absPath)
	if err != nil {
		return Config{}, fmt.Errorf("open configuration %s: %w", absPath, err)
	}
	defer file.Close()

	loaded := defaultConfig()
	decoder := yaml.NewDecoder(file)
	decoder.KnownFields(true)
	if err := decoder.Decode(&loaded); err != nil {
		return Config{}, fmt.Errorf("decode configuration %s: %w", absPath, err)
	}
	var trailing yaml.Node
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err != nil {
			return Config{}, fmt.Errorf("decode configuration %s: %w", absPath, err)
		}
		return Config{}, fmt.Errorf("decode configuration %s: multiple YAML documents are not supported", absPath)
	}

	loaded.Path = absPath
	resolvePaths(&loaded)
	if err := validate(loaded); err != nil {
		return Config{}, fmt.Errorf("configuration %s: %w", absPath, err)
	}
	return loaded, nil
}

func defaultConfig() Config {
	return Config{
		StorageDir:        "./storage",
		Theme:             ThemeDefault,
		BackgroundPattern: BackgroundPatternMeridianGrid,
		WebSearch:         WebSearchBaidu,
		Server: ServerConfig{
			Listen: "127.0.0.1", Port: 8080, ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout: 20 * time.Second, WriteTimeout: 30 * time.Second,
			IdleTimeout: 90 * time.Second, ShutdownTimeout: 10 * time.Second,
		},
		Health:  HealthConfig{URI: "/health"},
		Logging: LoggingConfig{Level: "info", Format: "json", AccessLog: true},
		Catalog: CatalogConfig{Path: "./urls.yaml", Watch: true, ReloadDebounce: 250 * time.Millisecond},
		Navigation: NavigationConfig{
			PrivateProbeTimeout: 800 * time.Millisecond, PublicProbeTimeout: 1200 * time.Millisecond,
			ProbeCacheTTL: 30 * time.Second, MaxConcurrentProbes: 32,
		},
		Favicon: FaviconConfig{
			FetchTimeout: 3 * time.Second, RefreshInterval: 168 * time.Hour,
			MaxFileBytes: 1_048_576, Workers: 4,
		},
	}
}

func selectPath(flagValue string, lookupEnv LookupEnv) (string, error) {
	if path := strings.TrimSpace(flagValue); path != "" {
		return path, nil
	}
	if lookupEnv != nil {
		if path, ok := lookupEnv("configpath"); ok && strings.TrimSpace(path) != "" {
			return strings.TrimSpace(path), nil
		}
	}
	return "./config.yaml", nil
}

func resolvePaths(loaded *Config) {
	baseDir := filepath.Dir(loaded.Path)
	loaded.StorageDir = resolvePath(baseDir, loaded.StorageDir)
	loaded.Catalog.Path = resolvePath(baseDir, loaded.Catalog.Path)
}

func resolvePath(baseDir, path string) string {
	trimmed := strings.TrimSpace(path)
	if filepath.IsAbs(trimmed) {
		return filepath.Clean(trimmed)
	}
	return filepath.Clean(filepath.Join(baseDir, trimmed))
}

func validate(loaded Config) error {
	if loaded.StorageDir == "" {
		return fieldError("storage", "must not be empty")
	}
	if _, ok := themes[loaded.Theme]; !ok {
		return fieldError("theme", "must be a supported theme")
	}
	if _, ok := backgroundPatterns[loaded.BackgroundPattern]; !ok {
		return fieldError("background_pattern", "must be a supported background pattern")
	}
	if _, ok := webSearchProviders[loaded.WebSearch]; !ok {
		return fieldError("web_search", "must be a supported search provider")
	}
	if strings.TrimSpace(loaded.Server.Listen) == "" {
		return fieldError("server.listen", "must not be empty")
	}
	if loaded.Server.Port < 1 || loaded.Server.Port > 65_535 {
		return fieldError("server.port", "must be between 1 and 65535")
	}
	for _, durationField := range []struct {
		path     string
		duration time.Duration
	}{
		{"server.read_header_timeout", loaded.Server.ReadHeaderTimeout},
		{"server.read_timeout", loaded.Server.ReadTimeout},
		{"server.write_timeout", loaded.Server.WriteTimeout},
		{"server.idle_timeout", loaded.Server.IdleTimeout},
		{"server.shutdown_timeout", loaded.Server.ShutdownTimeout},
		{"catalog.reload_debounce", loaded.Catalog.ReloadDebounce},
		{"navigation.private_probe_timeout", loaded.Navigation.PrivateProbeTimeout},
		{"navigation.public_probe_timeout", loaded.Navigation.PublicProbeTimeout},
		{"navigation.probe_cache_ttl", loaded.Navigation.ProbeCacheTTL},
		{"favicon.fetch_timeout", loaded.Favicon.FetchTimeout},
		{"favicon.refresh_interval", loaded.Favicon.RefreshInterval},
	} {
		path, duration := durationField.path, durationField.duration
		if duration <= 0 {
			return fieldError(path, "must be greater than zero")
		}
	}
	if isReservedHealthURI(loaded.Health.URI) {
		return fieldError("health.uri", "must be an unreserved absolute path")
	}
	if _, ok := map[string]struct{}{"debug": {}, "info": {}, "warn": {}, "error": {}}[loaded.Logging.Level]; !ok {
		return fieldError("logging.level", "must be debug, info, warn, or error")
	}
	if _, ok := map[string]struct{}{"json": {}, "logfmt": {}}[loaded.Logging.Format]; !ok {
		return fieldError("logging.format", "must be json or logfmt")
	}
	if err := validateCatalogPath(loaded.Catalog.Path); err != nil {
		return fieldError("catalog.path", err.Error())
	}
	if loaded.Navigation.MaxConcurrentProbes < 1 {
		return fieldError("navigation.max_concurrent_probes", "must be greater than zero")
	}
	if loaded.Favicon.MaxFileBytes < 1_024 || loaded.Favicon.MaxFileBytes > 4_194_304 {
		return fieldError("favicon.max_file_bytes", "must be between 1024 and 4194304")
	}
	if loaded.Favicon.Workers < 1 || loaded.Favicon.Workers > 16 {
		return fieldError("favicon.workers", "must be between 1 and 16")
	}
	return nil
}

func validateCatalogPath(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("cannot access catalog file")
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("must be a regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("must be readable")
	}
	return file.Close()
}

func isReservedHealthURI(uri string) bool {
	if !strings.HasPrefix(uri, "/") || uri == "/" {
		return true
	}
	return uri == "/api" || strings.HasPrefix(uri, "/api/") || uri == "/go" || strings.HasPrefix(uri, "/go/")
}

type validationError struct {
	path    string
	message string
}

func (e validationError) Error() string {
	return fmt.Sprintf("%s: %s", e.path, e.message)
}

func fieldError(path, message string) error {
	return validationError{path: path, message: message}
}
