// Package config loads and validates the Navi main configuration file.
package config

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	"go.yaml.in/yaml/v3"
	"golang.org/x/crypto/bcrypt"
)

const maxConfigBytes = 1 << 20

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
	loggingLevels  = map[string]struct{}{"debug": {}, "info": {}, "warn": {}, "error": {}}
	loggingFormats = map[string]struct{}{"json": {}, "logfmt": {}}
)

// Config is the validated process configuration with absolute filesystem paths.
type Config struct {
	Auth              AuthConfig       `yaml:"auth"`
	Path              string           `yaml:"-"`
	StorageDir        string           `yaml:"storage"`
	Theme             string           `yaml:"theme"`
	BackgroundPattern string           `yaml:"background_pattern"`
	WebSearch         string           `yaml:"web_search"`
	Server            ServerConfig     `yaml:"server"`
	Logging           LoggingConfig    `yaml:"logging"`
	Catalog           CatalogConfig    `yaml:"catalog"`
	Navigation        NavigationConfig `yaml:"navigation"`
	Favicon           FaviconConfig    `yaml:"favicon"`
}

// AuthConfig supplies the single account used to access Navi.
type AuthConfig struct {
	Username     string `yaml:"username"`
	PasswordHash string `yaml:"password_hash"`
	SecureCookie bool   `yaml:"secure_cookie"`
}

// Enabled reports whether authentication is configured. Validation rejects partial accounts.
func (a AuthConfig) Enabled() bool { return a.Username != "" || a.PasswordHash != "" }

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

// NavigationConfig controls private destination probes.
type NavigationConfig struct {
	PrivateProbeTimeout time.Duration `yaml:"private_probe_timeout"`
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

// Source describes where configuration comes from.
type Source struct {
	Path      string                      // selected file
	Explicit  bool                        // chosen by --config or CONFIG_FILE
	WorkDir   string                      // absolute base for Path and built-in defaults
	LookupEnv func(string) (string, bool) // os.LookupEnv in production; nil disables overrides
}

// Load reads the selected file, applies NAVI_* overrides, resolves paths, and
// validates the result. A missing file is an error when src.Explicit is set;
// otherwise the built-in defaults apply.
func Load(src Source) (Config, error) {
	if src.LookupEnv != nil {
		if _, exists := src.LookupEnv("NAVI_AUTH__PASSWORD"); exists {
			return Config{}, errors.New("NAVI_AUTH__PASSWORD is no longer supported; configure NAVI_AUTH__PASSWORD_HASH")
		}
	}
	if strings.TrimSpace(src.Path) == "" {
		return Config{}, errors.New("config path must not be empty")
	}
	if !filepath.IsAbs(src.WorkDir) {
		return Config{}, fmt.Errorf("resolve config path %q: work directory %q is not absolute", src.Path, src.WorkDir)
	}
	absPath := src.Path
	if !filepath.IsAbs(absPath) {
		absPath = filepath.Join(src.WorkDir, absPath)
	}
	absPath = filepath.Clean(absPath)
	defaults := defaultConfig()
	resolvePaths(&defaults, src.WorkDir)
	baseDir := filepath.Dir(absPath)
	loaded, err := decodeFile(absPath, defaults)
	if errors.Is(err, fs.ErrNotExist) && !src.Explicit {
		// Only an absent implicit configuration permits built-in defaults.
		loaded, err = defaults, nil
		baseDir = src.WorkDir
	}
	if err != nil {
		return Config{}, err
	}
	src.Path = absPath
	return finishConfig(loaded, src, baseDir)
}

func decodeFile(absPath string, defaults Config) (Config, error) {
	info, err := os.Stat(absPath)
	if err != nil {
		return Config{}, err // *fs.PathError already identifies the operation and file.
	}
	if !info.Mode().IsRegular() {
		return Config{}, fmt.Errorf("config %q must be a regular file", absPath)
	}
	file, err := os.Open(absPath)
	if err != nil {
		return Config{}, err // *fs.PathError names the operation and the file
	}
	defer file.Close() // Read-only descriptor; failures cannot invalidate the completed read.

	loaded, err := decodeConfig(file, defaults)
	if err != nil {
		return Config{}, fmt.Errorf("config %q: %w", absPath, err)
	}
	return loaded, nil
}

func decodeConfig(reader io.Reader, defaults Config) (Config, error) {
	contents, err := io.ReadAll(io.LimitReader(reader, maxConfigBytes+1))
	if err != nil {
		return Config{}, fmt.Errorf("read config: %w", err)
	}
	if len(contents) > maxConfigBytes {
		return Config{}, errors.New("config exceeds size limit of 1 MiB")
	}
	loaded := defaults
	decoder := yaml.NewDecoder(bytes.NewReader(contents))
	decoder.KnownFields(true)
	if err := decoder.Decode(&loaded); err != nil {
		return Config{}, fmt.Errorf("decode config: %w", err)
	}
	var trailing yaml.Node
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err != nil {
			return Config{}, fmt.Errorf("decode config: %w", err)
		}
		return Config{}, errors.New("config contains multiple YAML documents")
	}
	return loaded, nil
}

// finishConfig normalizes a decoded configuration; Validate only checks it.
func finishConfig(loaded Config, src Source, baseDir string) (Config, error) {
	if src.LookupEnv != nil {
		if err := applyEnvironment(reflect.ValueOf(&loaded).Elem(), environmentScope{Prefix: "NAVI", FieldPrefix: "", Lookup: src.LookupEnv}); err != nil {
			return Config{}, fmt.Errorf("%s: %w", src.Path, err)
		}
	}
	if strings.TrimSpace(loaded.StorageDir) == "" {
		return Config{}, fmt.Errorf("%s: %w", src.Path, fieldError("storage", "must not be empty"))
	}
	loaded.Path = src.Path
	resolvePaths(&loaded, baseDir)
	if err := loaded.Validate(); err != nil {
		return Config{}, fmt.Errorf("%s: %w", src.Path, err)
	}
	return loaded, nil
}

func defaultConfig() Config {
	return Config{
		StorageDir:        ".cache",
		Theme:             ThemeDefault,
		BackgroundPattern: BackgroundPatternContour,
		WebSearch:         WebSearchBaidu,
		Server: ServerConfig{
			Listen: "127.0.0.1", Port: 8080, ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout: 20 * time.Second, WriteTimeout: 30 * time.Second,
			IdleTimeout: 90 * time.Second, ShutdownTimeout: 10 * time.Second,
		},
		Logging: LoggingConfig{Level: "info", Format: "json", AccessLog: true},
		Catalog: CatalogConfig{Path: "configs/urls.yaml", Watch: true, ReloadDebounce: 250 * time.Millisecond},
		Navigation: NavigationConfig{
			PrivateProbeTimeout: 800 * time.Millisecond, ProbeCacheTTL: 30 * time.Second, MaxConcurrentProbes: 32,
		},
		Favicon: FaviconConfig{
			FetchTimeout: 3 * time.Second, RefreshInterval: 168 * time.Hour,
			MaxFileBytes: 1_048_576, Workers: 4,
		},
	}
}

// environmentScope groups the inputs for applyEnvironment.
type environmentScope struct {
	Prefix      string
	FieldPrefix string
	Lookup      func(string) (string, bool)
}

// applyEnvironment maps YAML fields to NAVI_<FIELD> and NAVI_<SECTION>__<FIELD>
// variables (Go代码规范.md §7); errors name the field path and the variable.
func applyEnvironment(value reflect.Value, options environmentScope) error {
	prefix, fieldPrefix, lookup := options.Prefix, options.FieldPrefix, options.Lookup

	separator := "_"
	if fieldPrefix != "" {
		separator = "__"
	}
	for i := range value.NumField() {
		field := value.Field(i)
		tag := value.Type().Field(i).Tag.Get("yaml")
		if tag == "-" || tag == "" {
			continue
		}
		name := prefix + separator + strings.ToUpper(tag)
		fieldPath := fieldPrefix + tag
		if field.Kind() == reflect.Struct {
			if err := applyEnvironment(field, environmentScope{Prefix: name, FieldPrefix: fieldPath + ".", Lookup: lookup}); err != nil {
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
			return fieldError(fieldPath, name+" must be a single non-null scalar")
		}
		decoder := yaml.NewDecoder(strings.NewReader(raw))
		if err := decoder.Decode(field.Addr().Interface()); err != nil {
			return fmt.Errorf("%s: decode %s: %w", fieldPath, name, err)
		}
		var trailing yaml.Node
		if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
			return fieldError(fieldPath, name+" must be a single non-null scalar")
		}
	}
	return nil
}

func resolvePaths(loaded *Config, baseDir string) {
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

// Validate checks a loaded configuration without modifying it. The catalog
// file must exist and be readable.
func (c Config) Validate() error {
	if c.Auth.Enabled() && (strings.TrimSpace(c.Auth.Username) == "" || len(c.Auth.Username) > 128) {
		return fieldError("auth.username", "must contain 1–128 bytes and not be blank")
	}
	if c.Auth.Enabled() {
		cost, err := bcrypt.Cost([]byte(c.Auth.PasswordHash))
		if err != nil || cost < 10 || cost > 14 || len(c.Auth.PasswordHash) != 60 {
			return fieldError("auth.password_hash", "must be a bcrypt hash with cost 10–14")
		}
	}
	if _, ok := themes[c.Theme]; !ok {
		return fieldError("theme", "must be a supported theme")
	}
	if _, ok := backgroundPatterns[c.BackgroundPattern]; !ok {
		return fieldError("background_pattern", "must be a supported background pattern")
	}
	if _, ok := webSearchProviders[c.WebSearch]; !ok {
		return fieldError("web_search", "must be a supported search provider")
	}
	if strings.TrimSpace(c.Server.Listen) == "" {
		return fieldError("server.listen", "must not be empty")
	}
	if c.Server.Port < 1 || c.Server.Port > 65_535 {
		return fieldError("server.port", "must be between 1 and 65535")
	}
	for _, durationField := range []struct {
		path     string
		duration time.Duration
	}{
		{"server.read_header_timeout", c.Server.ReadHeaderTimeout},
		{"server.read_timeout", c.Server.ReadTimeout},
		{"server.write_timeout", c.Server.WriteTimeout},
		{"server.idle_timeout", c.Server.IdleTimeout},
		{"server.shutdown_timeout", c.Server.ShutdownTimeout},
		{"catalog.reload_debounce", c.Catalog.ReloadDebounce},
		{"navigation.private_probe_timeout", c.Navigation.PrivateProbeTimeout},
		{"navigation.probe_cache_ttl", c.Navigation.ProbeCacheTTL},
		{"favicon.fetch_timeout", c.Favicon.FetchTimeout},
		{"favicon.refresh_interval", c.Favicon.RefreshInterval},
	} {
		if durationField.duration <= 0 {
			return fieldError(durationField.path, "must be greater than zero")
		}
	}
	if _, ok := loggingLevels[c.Logging.Level]; !ok {
		return fieldError("logging.level", "must be debug, info, warn, or error")
	}
	if _, ok := loggingFormats[c.Logging.Format]; !ok {
		return fieldError("logging.format", "must be json or logfmt")
	}
	if err := validateCatalogPath(c.Catalog.Path); err != nil {
		return validationError{path: "catalog.path", cause: err}
	}
	if c.Navigation.MaxConcurrentProbes < 1 || c.Navigation.MaxConcurrentProbes > 256 {
		return fieldError("navigation.max_concurrent_probes", "must be between 1 and 256")
	}
	if c.Favicon.MaxFileBytes < 1_024 || c.Favicon.MaxFileBytes > 4_194_304 {
		return fieldError("favicon.max_file_bytes", "must be between 1024 and 4194304")
	}
	if c.Favicon.Workers < 1 || c.Favicon.Workers > 16 {
		return fieldError("favicon.workers", "must be between 1 and 16")
	}
	return nil
}

// validateCatalogPath errors name the resolved path, which may differ from the
// configured relative value.
func validateCatalogPath(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("cannot access catalog file: %w", err)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("%s must be a regular file", path)
	}
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("catalog file must be readable: %w", err)
	}
	return file.Close()
}

type validationError struct {
	path  string
	cause error
}

func (e validationError) Error() string {
	return e.path + ": " + e.cause.Error()
}

func (e validationError) Unwrap() error { return e.cause }

func fieldError(path, message string) error {
	return validationError{path: path, cause: errors.New(message)}
}

// String redacts credential material from diagnostics.
func (a AuthConfig) String() string { return "AuthConfig{credentials: [REDACTED]}" }

// GoString also redacts Go-syntax formatting, including nested Config values.
func (a AuthConfig) GoString() string { return a.String() }
