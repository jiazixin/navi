package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadUsesFlagBeforeEnvironmentAndResolvesRelativePaths(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	first := writeConfigFixture(t, root, "first/config.yaml", "catalog-one.yaml", "data-one")
	second := writeConfigFixture(t, root, "second/config.yaml", "catalog-two.yaml", "data-two")

	loaded, err := Load([]string{"-f", first}, func(name string) (string, bool) {
		if name == "configpath" {
			return second, true
		}
		return "", false
	})
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if loaded.Path != first {
		t.Fatalf("Path = %q, want %q", loaded.Path, first)
	}
	if loaded.Catalog.Path != filepath.Join(filepath.Dir(first), "catalog-one.yaml") {
		t.Fatalf("Catalog.Path = %q", loaded.Catalog.Path)
	}
	if loaded.DataDir != filepath.Join(filepath.Dir(first), "data-one") {
		t.Fatalf("DataDir = %q", loaded.DataDir)
	}
}

func TestLoadUsesEnvironmentBeforeDefaultPath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configured := writeConfigFixture(t, root, "config.yaml", "urls.yaml", "data")

	loaded, err := Load(nil, func(name string) (string, bool) {
		return configured, name == "configpath"
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
	if err := os.WriteFile(configPath, []byte("catalog:\n  path: ./urls.yaml\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	loaded, err := Load([]string{"-f", configPath}, nil)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if loaded.Theme != ThemeDefault || loaded.BackgroundPattern != BackgroundPatternMeridianGrid || loaded.WebSearch != WebSearchBaidu {
		t.Fatalf("defaults = %#v", loaded)
	}
}

func TestLoadRejectsInvalidValues(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configPath := writeConfigFixture(t, root, "config.yaml", "urls.yaml", "data")

	for name, test := range map[string]struct {
		mutate func(string) string
	}{
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

			_, err = Load([]string{"-f", configPath}, nil)
			if err == nil {
				t.Fatal("Load() error = nil, want validation error")
			}
			if !strings.Contains(err.Error(), configPath) {
				t.Fatalf("error %q does not contain config path", err)
			}
		})
	}
}

func writeConfigFixture(t *testing.T, root, relativeConfig, catalogName, dataDir string) string {
	t.Helper()

	configPath := filepath.Join(root, relativeConfig)
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(configDir, catalogName), []byte("version: 1\npages:\n  - {id: page1, title: Navi, urls: []}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	contents := "datadir: ./%s\ntheme: default\nbackground_pattern: meridian-grid\nweb_search: baidu\nserver:\n  listen: 127.0.0.1\n  port: 8080\n  read_header_timeout: 5s\n  read_timeout: 20s\n  write_timeout: 30s\n  idle_timeout: 90s\n  shutdown_timeout: 10s\nhealth:\n  uri: /health\nlogging:\n  level: info\n  format: json\n  access_log: true\n  log_health_checks: false\ncatalog:\n  path: ./%s\n  watch: true\n  reload_debounce: 250ms\nnavigation:\n  private_probe_timeout: 800ms\n  public_probe_timeout: 1200ms\n  probe_cache_ttl: 30s\n  max_concurrent_probes: 32\nfavicon:\n  fetch_timeout: 3s\n  refresh_interval: 168h\n  max_file_bytes: 1048576\n  workers: 4\n"
	if err := os.WriteFile(configPath, []byte(fmt.Sprintf(contents, dataDir, catalogName)), 0o600); err != nil {
		t.Fatal(err)
	}
	return configPath
}
