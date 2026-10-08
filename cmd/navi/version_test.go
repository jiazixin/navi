package main

import (
	"runtime/debug"
	"testing"
)

func TestDefaultVersionInformation(t *testing.T) {
	if version != "dev" {
		t.Fatalf("version = %q, want %q", version, "dev")
	}
	if commit != "unknown" {
		t.Fatalf("commit = %q, want %q", commit, "unknown")
	}
	if buildTime != "unknown" {
		t.Fatalf("buildTime = %q, want %q", buildTime, "unknown")
	}
}

func TestFormatVersion(t *testing.T) {
	got := formatVersion("v1.2.3", "abc1234", "2026-10-08T00:00:00Z")
	want := "Navi v1.2.3 (abc1234, 2026-10-08T00:00:00Z)"
	if got != want {
		t.Fatalf("formatVersion() = %q, want %q", got, want)
	}
}

func TestResolveBuildInformationUsesInjectedValues(t *testing.T) {
	base := buildInformation{
		version:   "v2.0.0",
		commit:    "injected",
		buildTime: "injected-time",
	}
	goBuild := &debug.BuildInfo{
		Main: debug.Module{Version: "v1.0.0"},
		Settings: []debug.BuildSetting{
			{Key: "vcs.revision", Value: "0123456789abcdef"},
			{Key: "vcs.time", Value: "2026-10-08T00:00:00Z"},
		},
	}

	got := resolveBuildInformation(base, goBuild)
	if got != base {
		t.Fatalf("resolveBuildInformation() = %#v, want %#v", got, base)
	}
}

func TestResolveBuildInformationUsesModuleVersion(t *testing.T) {
	goBuild := &debug.BuildInfo{
		Main: debug.Module{Version: "v1.2.3"},
		Settings: []debug.BuildSetting{
			{Key: "vcs.revision", Value: "0123456789abcdef"},
			{Key: "vcs.time", Value: "2026-10-08T00:00:00Z"},
		},
	}

	got := resolveBuildInformation(defaultBuildInformation(), goBuild)
	want := buildInformation{
		version:   "v1.2.3",
		commit:    "0123456",
		buildTime: "unknown",
	}
	if got != want {
		t.Fatalf("resolveBuildInformation() = %#v, want %#v", got, want)
	}
}

func TestResolveBuildInformationUsesShortRevisionForDevelopmentBuild(t *testing.T) {
	goBuild := &debug.BuildInfo{
		Main: debug.Module{Version: "(devel)"},
		Settings: []debug.BuildSetting{
			{Key: "vcs.revision", Value: "abcdef0123456789"},
		},
	}

	got := resolveBuildInformation(defaultBuildInformation(), goBuild)
	if got.version != "abcdef0" {
		t.Fatalf("resolveBuildInformation() version = %q, want %q", got.version, "abcdef0")
	}
	if got.commit != "abcdef0" {
		t.Fatalf("resolveBuildInformation() commit = %q, want %q", got.commit, "abcdef0")
	}
}

func TestResolveBuildInformationIgnoresPseudoVersion(t *testing.T) {
	goBuild := &debug.BuildInfo{
		Main: debug.Module{Version: "v0.0.0-20261007161818-11d793cb5d69+dirty"},
		Settings: []debug.BuildSetting{
			{Key: "vcs.revision", Value: "11d793cb5d6987654321"},
		},
	}

	got := resolveBuildInformation(defaultBuildInformation(), goBuild)
	if got.version != "11d793c" {
		t.Fatalf("resolveBuildInformation() version = %q, want %q", got.version, "11d793c")
	}
}

func TestResolveBuildInformationFallsBackWithoutMetadata(t *testing.T) {
	want := defaultBuildInformation()
	got := resolveBuildInformation(want, nil)
	if got != want {
		t.Fatalf("resolveBuildInformation() = %#v, want %#v", got, want)
	}
}

func TestResolveBuildInformationUsesPseudoVersionRevision(t *testing.T) {
	for _, moduleVersion := range []string{
		"v0.0.0-20261007161818-11d793cb5d69",
		"v1.2.4-0.20261007161818-11d793cb5d69",
		"v1.2.3-rc.1.0.20261007161818-11d793cb5d69",
		"v0.0.0-20261007161818-11d793cb5d69+dirty",
		"v2.0.1-0.20261007161818-11d793cb5d69+incompatible",
		"v2.0.1-0.20261007161818-11d793cb5d69+incompatible.dirty",
	} {
		t.Run(moduleVersion, func(t *testing.T) {
			goBuild := &debug.BuildInfo{Main: debug.Module{Version: moduleVersion}}
			got := resolveBuildInformation(defaultBuildInformation(), goBuild)
			want := buildInformation{version: "11d793c", commit: "11d793c", buildTime: "unknown"}
			if got != want {
				t.Fatalf("resolveBuildInformation() = %#v, want %#v", got, want)
			}
		})
	}
}

func TestResolveBuildInformationPrefersVCSRevision(t *testing.T) {
	goBuild := &debug.BuildInfo{
		Main: debug.Module{Version: "v2.0.1-0.20261007161818-11d793cb5d69+incompatible.dirty"},
		Settings: []debug.BuildSetting{
			{Key: "vcs.revision", Value: "abcdef0123456789"},
		},
	}
	got := resolveBuildInformation(defaultBuildInformation(), goBuild)
	if got.version != "abcdef0" || got.commit != "abcdef0" {
		t.Fatalf("resolveBuildInformation() = %#v, want VCS revision abcdef0", got)
	}
}
