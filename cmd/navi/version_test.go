package main

import "testing"

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
