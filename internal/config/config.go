// Package config loads and validates the Navi main configuration file.
package config

import (
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

const (
	// ThemeDefault follows the operating system color scheme: ink when dark, paper when light.
	ThemeDefault = "default"

	// BackgroundPatternContour is the default animated background pattern.
	BackgroundPatternContour = "contour"

	// WebSearchBaidu is the default external search provider.
	WebSearchBaidu = "baidu"
)

var (
	themes = map[string]struct{}{
		"default": {}, "ink": {}, "paper": {}, "celadon": {}, "dusk": {},
	}
	backgroundPatterns = map[string]struct{}{
		"none": {}, "contour": {}, "flow": {}, "guilloche": {}, "stars": {}, "ridge": {},
	}
	webSearchProviders = map[string]struct{}{
		"baidu": {}, "google": {}, "yandex": {}, "bing": {}, "github": {}, "chatgpt": {},
		"claude": {}, "gemini": {},
	}
)

// Config is the validated process configuration with paths resolved from its file.
type Config struct {
	Auth              AuthConfig       `yaml:"auth"`
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

// AuthConfig supplies the single account used to access Navi.
type AuthConfig struct {
	Username     string `yaml:"username"`
	Password     string `yaml:"password"`
	SecureCookie bool   `yaml:"secure_cookie"`
}

// Enabled reports whether authentication is configured. Validation rejects partial accounts.
func (a AuthConfig) Enabled() bool { return a.Username != "" || a.Password != "" }

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
func Load(lookupEnv LookupEnv) (Config, error) {
	configPath := "./configs/config.local.yaml"
	explicit := false
	if lookupEnv != nil {
		if value, ok := lookupEnv("CONFIG_FILE"); ok {
			if strings.TrimSpace(value) == "" {
				return Config{}, fmt.Errorf("CONFIG_FILE must not be empty")
			}
			configPath, explicit = value, true
		}
	}
	loaded, err := loadFile(configPath, lookupEnv)
	if err == nil || explicit || !errors.Is(err, os.ErrNotExist) {
		return loaded, err
	}
	// Only an absent implicit configuration permits built-in defaults.
	absPath, err := filepath.Abs(configPath)
	if err != nil {
		return Config{}, err
	}
	return finishConfig(defaultConfig(), absPath, lookupEnv)
}

// LoadFile loads and validates a specific main configuration file.
func LoadFile(path string) (Config, error) {
	return loadFile(path, nil)
}

func loadFile(path string, lookupEnv LookupEnv) (Config, error) {
	if strings.TrimSpace(path) == "" {
		return Config{}, fmt.Errorf("configuration path must not be empty")
	}
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

	return finishConfig(loaded, absPath, lookupEnv)
}

func finishConfig(loaded Config, absPath string, lookupEnv LookupEnv) (Config, error) {
	if lookupEnv != nil {
		if err := applyEnvironment(reflect.ValueOf(&loaded).Elem(), "NAVI", lookupEnv); err != nil {
			return Config{}, err
		}
	}
	if strings.TrimSpace(loaded.StorageDir) == "" {
		return Config{}, fmt.Errorf("configuration %s: storage: must not be empty", absPath)
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
		StorageDir:        "../.cache",
		Theme:             ThemeDefault,
		BackgroundPattern: BackgroundPatternContour,
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

// applyEnvironment maps YAML fields to NAVI_<SECTION>_<FIELD> variables.
func applyEnvironment(value reflect.Value, prefix string, lookup LookupEnv) error {
	for i := range value.NumField() {
		field := value.Field(i)
		tag := value.Type().Field(i).Tag.Get("yaml")
		if tag == "-" || tag == "" {
			continue
		}
		name := prefix + "_" + strings.ToUpper(tag)
		if field.Kind() == reflect.Struct {
			if err := applyEnvironment(field, name, lookup); err != nil {
				return err
			}
			continue
		}
		raw, ok := lookup(name)
		if !ok {
			continue
		}
		if field.Kind() == reflect.String {
			field.SetString(raw)
			continue
		}
		var node yaml.Node
		if err := yaml.Unmarshal([]byte(raw), &node); err != nil || len(node.Content) != 1 || node.Content[0].Kind != yaml.ScalarNode || node.Content[0].Tag == "!!null" {
			return fmt.Errorf("%s: expected a non-null scalar", name)
		}
		decoder := yaml.NewDecoder(strings.NewReader(raw))
		if err := decoder.Decode(field.Addr().Interface()); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		var trailing yaml.Node
		if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
			return fmt.Errorf("%s: expected one scalar value", name)
		}
	}
	return nil
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
	if loaded.Auth.Enabled() && (strings.TrimSpace(loaded.Auth.Username) == "" || len(loaded.Auth.Username) > 128) {
		return fieldError("auth.username", "must contain 1–128 bytes and not be blank")
	}
	if loaded.Auth.Enabled() && (strings.TrimSpace(loaded.Auth.Password) == "" || len(loaded.Auth.Password) > 1024) {
		return fieldError("auth.password", "must contain 1–1024 bytes and not be blank")
	}
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
	parsed, err := url.ParseRequestURI(uri)
	if err != nil || parsed.Path != uri || parsed.RawQuery != "" || parsed.Fragment != "" || path.Clean(uri) != uri || strings.HasPrefix(uri, "//") || strings.ContainsAny(uri, "?#") {
		return true
	}
	if !strings.HasPrefix(uri, "/") || uri == "/" {
		return true
	}
	return uri == "/login" || strings.HasPrefix(uri, "/assets") || uri == "/index.html" || uri == "/api" || strings.HasPrefix(uri, "/api/") || uri == "/go" || strings.HasPrefix(uri, "/go/")
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
