package config

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// loadFile loads an explicitly selected, absolute configuration path.
func loadFile(path string) (Config, error) {
	return Load(Source{Path: path, Explicit: true})
}

func TestLoadUsesSelectedPathAndIgnoresConfigFile(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configured := writeConfigFixture(t, root, configFixture{RelativeConfig: "config.yaml", CatalogName: "urls.yaml", StorageDir: "storage"})
	other := writeConfigFixture(t, root, configFixture{RelativeConfig: "other/config.yaml", CatalogName: "urls.yaml", StorageDir: "storage"})

	loaded, err := Load(Source{Path: "config.yaml", Explicit: true, WorkDir: root, LookupEnv: func(name string) (string, bool) {
		return other, name == "CONFIG_FILE"
	}})
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if loaded.Path != configured {
		t.Fatalf("Path = %q, want %q", loaded.Path, configured)
	}
}

func TestLoadRequiresAbsoluteWorkDirForRelativePath(t *testing.T) {
	t.Parallel()

	for _, workDir := range []string{"", "relative"} {
		_, err := Load(Source{Path: "config.yaml", WorkDir: workDir})
		if err == nil || !strings.Contains(err.Error(), "work directory") {
			t.Fatalf("got %v, want a work directory error", err)
		}
	}
}

func TestLoadAppliesPublicDefaults(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configPath := filepath.Join(root, "config.yaml")
	if err := os.WriteFile(filepath.Join(root, "urls.yaml"), []byte("version: 1\npages:\n  - {id: page1, title: Navi, urls: []}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, []byte("auth: {username: tester, password_hash: $2a$10$MH76nh/43WkSzvdsv9cze.Jmxo2eu6fQkcVtBgMvT2IAXwdLje7Gu}\ncatalog:\n  path: ./urls.yaml\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	loaded, err := loadFile(configPath)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if loaded.Theme != ThemeDefault || loaded.BackgroundPattern != BackgroundPatternContour || loaded.WebSearch != WebSearchBaidu {
		t.Fatalf("defaults = %#v", loaded)
	}
}

func TestLoadRejectsInvalidValues(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configPath := writeConfigFixture(t, root, configFixture{RelativeConfig: "config.yaml", CatalogName: "urls.yaml", StorageDir: "storage"})

	for name, test := range map[string]struct {
		mutate func(string) string
	}{
		"legacy datadir field": {mutate: func(contents string) string {
			return strings.Replace(contents, "storage: ./storage", "datadir: ./storage", 1)
		}},
		"unknown field": {mutate: func(contents string) string { return contents + "unknown: true\n" }},
		"invalid port": {mutate: func(contents string) string {
			return strings.Replace(contents, "port: 8080", "port: 0", 1)
		}},
		"invalid theme": {mutate: func(contents string) string {
			return strings.Replace(contents, "theme: default", "theme: imaginary", 1)
		}},
		"negative timeout": {mutate: func(contents string) string {
			return strings.Replace(contents, "read_timeout: 20s", "read_timeout: -1s", 1)
		}},
	} {
		t.Run(name, func(t *testing.T) {
			contents, err := os.ReadFile(configPath)
			if err != nil {
				t.Fatal(err)
			}
			updated := test.mutate(string(contents))
			if err := os.WriteFile(configPath, []byte(updated), 0o600); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				if err := os.WriteFile(configPath, contents, 0o600); err != nil {
					t.Fatal(err)
				}
			})

			_, err = loadFile(configPath)
			if err == nil {
				t.Fatal("Load() error = nil, want validation error")
			}
			if !strings.Contains(err.Error(), configPath) {
				t.Fatalf("error %q does not contain config path", err)
			}
		})
	}
}

// configFixture groups the inputs for writeConfigFixture.
type configFixture struct {
	RelativeConfig string
	CatalogName    string
	StorageDir     string
}

func writeConfigFixture(t *testing.T, root string, options configFixture) string {
	t.Helper()
	relativeConfig, catalogName, storageDir := options.RelativeConfig, options.CatalogName, options.StorageDir

	configPath := filepath.Join(root, relativeConfig)
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(configDir, catalogName), []byte("version: 1\npages:\n  - {id: page1, title: Navi, urls: []}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	contents := "auth: {username: tester, password_hash: $2a$10$MH76nh/43WkSzvdsv9cze.Jmxo2eu6fQkcVtBgMvT2IAXwdLje7Gu}\nstorage: ./%s\ntheme: default\nbackground_pattern: contour\nweb_search: baidu\nserver:\n  listen: 127.0.0.1\n  port: 8080\n  read_header_timeout: 5s\n  read_timeout: 20s\n  write_timeout: 30s\n  idle_timeout: 90s\n  shutdown_timeout: 10s\nlogging:\n  level: info\n  format: json\n  access_log: true\n  log_health_checks: false\ncatalog:\n  path: ./%s\n  watch: true\n  reload_debounce: 250ms\nnavigation:\n  private_probe_timeout: 800ms\n  probe_cache_ttl: 30s\n  max_concurrent_probes: 32\nfavicon:\n  fetch_timeout: 3s\n  refresh_interval: 168h\n  max_file_bytes: 1048576\n  workers: 4\n"
	if err := os.WriteFile(configPath, []byte(fmt.Sprintf(contents, storageDir, catalogName)), 0o600); err != nil {
		t.Fatal(err)
	}
	return configPath
}

func TestRejectsEmptyStorageBeforeResolvingPaths(t *testing.T) {
	root := t.TempDir()
	configPath := writeConfigFixture(t, root, configFixture{RelativeConfig: "config.yaml", CatalogName: "urls.yaml", StorageDir: "storage"})
	contents, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, []byte(strings.Replace(string(contents), "storage: ./storage", "storage: '  '", 1)), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadFile(configPath); err == nil || !strings.Contains(err.Error(), "storage") {
		t.Fatalf("expected storage error: %v", err)
	}
}

func TestAnnotatedExampleMatchesDefaults(t *testing.T) {
	// Initialize from tracked examples, without depending on private local files.
	directory := filepath.Join(t.TempDir(), "configs")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"config", "urls"} {
		contents, err := os.ReadFile("../../configs/" + name + ".example.yaml")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, name+".yaml"), contents, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	loaded, err := loadFile(filepath.Join(directory, "config.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	expected := defaultConfig()
	expected.Auth = loaded.Auth
	expected.Path = loaded.Path
	// Repository configuration keeps runtime data outside configs/.
	expected.StorageDir = "../.cache"
	resolvePaths(&expected)
	if !reflect.DeepEqual(loaded, expected) {
		t.Fatal("example settings differ from documented defaults")
	}
}

func TestPartialAuthCredentialsRejected(t *testing.T) {
	for _, auth := range []AuthConfig{{Username: "a"}, {PasswordHash: "b"}, {Username: " ", PasswordHash: "b"}} {
		cfg := defaultConfig()
		cfg.Auth = auth
		if err := cfg.Validate(); err == nil || !strings.Contains(err.Error(), "auth.") {
			t.Fatalf("accepted invalid auth")
		}
	}
}

func TestEmptyAuthIsOptional(t *testing.T) {
	root := t.TempDir()
	file := writeConfigFixture(t, root, configFixture{RelativeConfig: "config.yaml", CatalogName: "urls.yaml", StorageDir: "storage"})
	contents, _ := os.ReadFile(file)
	for _, replacement := range []string{"", "auth: {username: '', password_hash: ''}\n"} {
		updated := strings.Replace(string(contents), "auth: {username: tester, password_hash: $2a$10$MH76nh/43WkSzvdsv9cze.Jmxo2eu6fQkcVtBgMvT2IAXwdLje7Gu}\n", replacement, 1)
		if err := os.WriteFile(file, []byte(updated), 0600); err != nil {
			t.Fatal(err)
		}
		loaded, err := loadFile(file)
		if err != nil || loaded.Auth.Enabled() {
			t.Fatalf("empty auth: %v", err)
		}
	}
}

func TestLoadDefaultRepositoryLayout(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := writeConfigFixture(t, root, configFixture{RelativeConfig: "configs/config.local.yaml", CatalogName: "urls.yaml", StorageDir: "../.cache"})
	loaded, err := Load(Source{Path: "configs/config.local.yaml", WorkDir: root})
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Path != path || loaded.Catalog.Path != filepath.Join(root, "configs", "urls.yaml") || loaded.StorageDir != filepath.Join(root, ".cache") {
		t.Fatalf("unexpected resolved paths: config=%s catalog=%s storage=%s", loaded.Path, loaded.Catalog.Path, loaded.StorageDir)
	}
}

func TestMissingImplicitConfigUsesDefaultsWithoutLegacyFallback(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeConfigFixture(t, root, configFixture{RelativeConfig: "configs/unused.yaml", CatalogName: "urls.yaml", StorageDir: "unused-cache"})
	if err := os.WriteFile(filepath.Join(root, "config.yaml"), []byte("invalid: ["), 0600); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load(Source{Path: "configs/config.local.yaml", WorkDir: root})
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Server.Port != 8080 || loaded.StorageDir != filepath.Join(root, ".cache") || loaded.Catalog.Path != filepath.Join(root, "configs", "urls.yaml") {
		t.Fatalf("unexpected defaults: %+v", loaded)
	}
}

func TestExplicitConfigurationMustExist(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	for _, tc := range []struct {
		path string
		want string
	}{
		{"", "config path must not be empty"},
		{"  ", "config path must not be empty"},
		{"missing.yaml", "open " + filepath.Join(root, "missing.yaml") + ": no such file or directory"},
	} {
		_, err := Load(Source{Path: tc.path, Explicit: true, WorkDir: root})
		if err == nil || err.Error() != tc.want {
			t.Fatalf("got %v, want %q", err, tc.want)
		}
	}
}

func TestMissingImplicitConfigStillNeedsCatalog(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	_, err := Load(Source{Path: "configs/config.local.yaml", WorkDir: root})
	want := "catalog.path: cannot access catalog file"
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("got %v, want %q", err, want)
	}
}

func TestValidateDoesNotModify(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	loaded, err := loadFile(writeConfigFixture(t, root, configFixture{RelativeConfig: "config.yaml", CatalogName: "urls.yaml", StorageDir: "storage"}))
	if err != nil {
		t.Fatal(err)
	}
	before := loaded
	if err := loaded.Validate(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(loaded, before) {
		t.Fatalf("got %+v, want %+v", loaded, before)
	}
	loaded.Server.Port = 0
	if err := loaded.Validate(); err == nil || err.Error() != "server.port: must be between 1 and 65535" {
		t.Fatalf("got %v, want the server.port error", err)
	}
}

func TestEnvironmentOverridesFileAndDefaults(t *testing.T) {
	root := t.TempDir()
	writeConfigFixture(t, root, configFixture{RelativeConfig: "custom/config.local.yaml", CatalogName: "urls.yaml", StorageDir: "file-cache"})
	values := map[string]string{
		"NAVI_SERVER__PORT":           "9090",
		"NAVI_CATALOG__WATCH":         "false",
		"NAVI_FAVICON__FETCH_TIMEOUT": "7s",
		"NAVI_AUTH__PASSWORD_HASH":    "$2a$10$x5UV.kUW13vcqk.TuL9OguoMZkBTXE0HsSXon0Y08VU5PhiZ.24my",
		"NAVI_STORAGE":                "../.cache",
	}
	lookup := func(name string) (string, bool) { value, ok := values[name]; return value, ok }
	src := Source{Path: "custom/config.local.yaml", Explicit: true, WorkDir: root, LookupEnv: lookup}
	loaded, err := Load(src)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Path != filepath.Join(root, "custom/config.local.yaml") || loaded.Server.Port != 9090 || loaded.Catalog.Watch || loaded.Favicon.FetchTimeout.String() != "7s" || loaded.Auth.PasswordHash != values["NAVI_AUTH__PASSWORD_HASH"] || loaded.StorageDir != filepath.Join(root, ".cache") || loaded.Server.Listen != "127.0.0.1" {
		t.Fatalf("overrides not applied: %+v", loaded)
	}
	for _, invalid := range []string{"zero", "0", "", "null", "9090\n---\n8080"} {
		values["NAVI_SERVER__PORT"] = invalid
		if _, err := Load(src); err == nil || !strings.Contains(err.Error(), "server.port: ") {
			t.Errorf("override %q: got %v, want a server.port error", invalid, err)
		}
	}
}

func TestLoadReportsResolvedCatalogPath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configPath := filepath.Join(root, "config.yaml")
	if err := os.WriteFile(configPath, []byte("catalog:\n  path: ./missing.yaml\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := loadFile(configPath)
	if err == nil || !strings.Contains(err.Error(), filepath.Join(root, "missing.yaml")) {
		t.Fatalf("loadFile() error = %v, want the resolved catalog path", err)
	}
}

func TestConfigInputBound(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "oversized.yaml")
	if err := os.WriteFile(path, []byte("#"+strings.Repeat("x", 1<<20)), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadFile(path); err == nil || !strings.Contains(err.Error(), "size limit") {
		t.Fatalf("got %v, want size limit error", err)
	}
}

func TestAuthFormattingRedactsSecrets(t *testing.T) {
	t.Parallel()
	auth := AuthConfig{Username: "tester", PasswordHash: "secret-marker"}
	for _, format := range []string{"%v", "%+v", "%#v"} {
		if got := fmt.Sprintf(format, auth); strings.Contains(got, "secret-marker") {
			t.Errorf("format %s leaked secret", format)
		}
	}
}

func TestRejectsLegacyPasswordConfiguration(t *testing.T) {
	t.Parallel()
	if _, err := decodeConfig(strings.NewReader("auth: {username: tester, password: plaintext}")); err == nil {
		t.Fatal("accepted legacy password field")
	}
	_, err := Load(Source{Path: "unused", LookupEnv: func(name string) (string, bool) { return "redacted", name == "NAVI_AUTH__PASSWORD" }})
	if err == nil || !strings.Contains(err.Error(), "NAVI_AUTH__PASSWORD_HASH") {
		t.Fatalf("got %v, want migration error", err)
	}
}
