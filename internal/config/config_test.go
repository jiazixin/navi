package config

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestLoadUsesEnvironmentBeforeDefaultPath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configured := writeConfigFixture(t, root, "config.yaml", "urls.yaml", "storage")

	loaded, err := Load(func(name string) (string, bool) {
		return configured, name == "CONFIG_FILE"
	})
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if loaded.Path != configured {
		t.Fatalf("Path = %q, want %q", loaded.Path, configured)
	}
}

func TestLoadAppliesPublicDefaults(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configPath := filepath.Join(root, "config.yaml")
	if err := os.WriteFile(filepath.Join(root, "urls.yaml"), []byte("version: 1\npages:\n  - {id: page1, title: Navi, urls: []}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, []byte("auth: {username: tester, password: test-password}\ncatalog:\n  path: ./urls.yaml\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	loaded, err := LoadFile(configPath)
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
	configPath := writeConfigFixture(t, root, "config.yaml", "urls.yaml", "storage")

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

			_, err = LoadFile(configPath)
			if err == nil {
				t.Fatal("Load() error = nil, want validation error")
			}
			if !strings.Contains(err.Error(), configPath) {
				t.Fatalf("error %q does not contain config path", err)
			}
		})
	}
}

func writeConfigFixture(t *testing.T, root, relativeConfig, catalogName, storageDir string) string {
	t.Helper()

	configPath := filepath.Join(root, relativeConfig)
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(configDir, catalogName), []byte("version: 1\npages:\n  - {id: page1, title: Navi, urls: []}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	contents := "auth: {username: tester, password: test-password}\nstorage: ./%s\ntheme: default\nbackground_pattern: contour\nweb_search: baidu\nserver:\n  listen: 127.0.0.1\n  port: 8080\n  read_header_timeout: 5s\n  read_timeout: 20s\n  write_timeout: 30s\n  idle_timeout: 90s\n  shutdown_timeout: 10s\nhealth:\n  uri: /health\nlogging:\n  level: info\n  format: json\n  access_log: true\n  log_health_checks: false\ncatalog:\n  path: ./%s\n  watch: true\n  reload_debounce: 250ms\nnavigation:\n  private_probe_timeout: 800ms\n  public_probe_timeout: 1200ms\n  probe_cache_ttl: 30s\n  max_concurrent_probes: 32\nfavicon:\n  fetch_timeout: 3s\n  refresh_interval: 168h\n  max_file_bytes: 1048576\n  workers: 4\n"
	if err := os.WriteFile(configPath, []byte(fmt.Sprintf(contents, storageDir, catalogName)), 0o600); err != nil {
		t.Fatal(err)
	}
	return configPath
}

func TestRejectsEmptyStorageBeforeResolvingPaths(t *testing.T) {
	root := t.TempDir()
	configPath := writeConfigFixture(t, root, "config.yaml", "urls.yaml", "storage")
	contents, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, []byte(strings.Replace(string(contents), "storage: ./storage", "storage: '  '", 1)), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadFile(configPath); err == nil || !strings.Contains(err.Error(), "storage") {
		t.Fatalf("expected storage error: %v", err)
	}
}

func TestHealthPathMustBeReachableAsConfigured(t *testing.T) {
	for _, uri := range []string{"/health?ready=1", "/health#ready", "//health", "/a/../health", "/%68ealth", "/health?", "/api/catalog"} {
		if !isReservedHealthURI(uri) {
			t.Errorf("accepted invalid health URI %q", uri)
		}
	}
	if isReservedHealthURI("/ready/live") {
		t.Fatal("rejected valid path")
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
	loaded, err := LoadFile(filepath.Join(directory, "config.yaml"))
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
	for _, auth := range []AuthConfig{{Username: "a"}, {Password: "b"}, {Username: " ", Password: "b"}} {
		cfg := defaultConfig()
		cfg.Auth = auth
		if err := validate(cfg); err == nil || !strings.Contains(err.Error(), "auth.") {
			t.Fatalf("accepted invalid auth")
		}
	}
	for _, path := range []string{"/login", "/assets/app.js", "/index.html"} {
		if !isReservedHealthURI(path) {
			t.Errorf("health shadows login: %s", path)
		}
	}
}

func TestEmptyAuthIsOptional(t *testing.T) {
	root := t.TempDir()
	file := writeConfigFixture(t, root, "config.yaml", "urls.yaml", "storage")
	contents, _ := os.ReadFile(file)
	for _, replacement := range []string{"", "auth: {username: '', password: ''}\n"} {
		updated := strings.Replace(string(contents), "auth: {username: tester, password: test-password}\n", replacement, 1)
		if err := os.WriteFile(file, []byte(updated), 0600); err != nil {
			t.Fatal(err)
		}
		loaded, err := LoadFile(file)
		if err != nil || loaded.Auth.Enabled() {
			t.Fatalf("empty auth: %v", err)
		}
	}
}

func TestLoadDefaultRepositoryLayout(t *testing.T) {
	root := t.TempDir()
	t.Chdir(root)
	path := writeConfigFixture(t, root, "configs/config.local.yaml", "urls.yaml", "../.cache")
	loaded, err := Load(nil)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Path != path || loaded.Catalog.Path != filepath.Join(root, "configs", "urls.yaml") || loaded.StorageDir != filepath.Join(root, ".cache") {
		t.Fatalf("unexpected resolved paths: config=%s catalog=%s storage=%s", loaded.Path, loaded.Catalog.Path, loaded.StorageDir)
	}
}

func TestMissingImplicitConfigUsesDefaultsWithoutLegacyFallback(t *testing.T) {
	root := t.TempDir()
	t.Chdir(root)
	writeConfigFixture(t, root, "configs/unused.yaml", "urls.yaml", "unused-cache")
	if err := os.WriteFile("config.yaml", []byte("invalid: ["), 0600); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load(nil)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Server.Port != 8080 || loaded.StorageDir != filepath.Join(root, ".cache") || loaded.Catalog.Path != filepath.Join(root, "configs", "urls.yaml") {
		t.Fatalf("unexpected defaults: %+v", loaded)
	}
}

func TestExplicitConfigurationMustExist(t *testing.T) {
	for _, path := range []string{"", "  ", filepath.Join(t.TempDir(), "missing.yaml")} {
		_, err := Load(func(name string) (string, bool) { return path, name == "CONFIG_FILE" })
		if err == nil {
			t.Fatalf("accepted explicit configuration %q", path)
		}
	}
}

func TestEnvironmentOverridesFileAndDefaults(t *testing.T) {
	root := t.TempDir()
	t.Chdir(root)
	writeConfigFixture(t, root, "custom/config.local.yaml", "urls.yaml", "file-cache")
	values := map[string]string{
		"CONFIG_FILE":                "custom/config.local.yaml",
		"NAVI_SERVER_PORT":           "9090",
		"NAVI_CATALOG_WATCH":         "false",
		"NAVI_FAVICON_FETCH_TIMEOUT": "7s",
		"NAVI_AUTH_PASSWORD":         " literal: #password ",
		"NAVI_STORAGE":               "../.cache",
	}
	lookup := func(name string) (string, bool) { value, ok := values[name]; return value, ok }
	loaded, err := Load(lookup)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Path != filepath.Join(root, "custom/config.local.yaml") || loaded.Server.Port != 9090 || loaded.Catalog.Watch || loaded.Favicon.FetchTimeout.String() != "7s" || loaded.Auth.Password != values["NAVI_AUTH_PASSWORD"] || loaded.StorageDir != filepath.Join(root, ".cache") || loaded.Server.Listen != "127.0.0.1" {
		t.Fatalf("overrides not applied: %+v", loaded)
	}
	for _, invalid := range []string{"zero", "0", "", "null", "9090\n---\n8080"} {
		values["NAVI_SERVER_PORT"] = invalid
		if _, err := Load(lookup); err == nil {
			t.Errorf("accepted invalid port override %q", invalid)
		}
	}
}
