package main

import (
	"errors"
	"flag"
	"io"
	"strings"
	"testing"
)

func TestParseCLIConfigAliases(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{name: "short", args: []string{"-f", "custom.yaml"}},
		{name: "short equals", args: []string{"-f=custom.yaml"}},
		{name: "long", args: []string{"--config", "custom.yaml"}},
		{name: "long equals", args: []string{"--config=custom.yaml"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseCLI(tt.args, io.Discard)
			if err != nil {
				t.Fatalf("parseCLI() error = %v", err)
			}
			if !got.configFileSet {
				t.Fatal("parseCLI() did not mark the configuration flag as set")
			}
			if got.configFile != "custom.yaml" {
				t.Fatalf("parseCLI() configFile = %q, want %q", got.configFile, "custom.yaml")
			}
		})
	}
}

func TestParseCLIHelpAliases(t *testing.T) {
	for _, arg := range []string{"-h", "--help"} {
		t.Run(arg, func(t *testing.T) {
			var output strings.Builder
			_, err := parseCLI([]string{arg}, &output)
			if !errors.Is(err, flag.ErrHelp) {
				t.Fatalf("parseCLI() error = %v, want flag.ErrHelp", err)
			}
			for _, want := range []string{"Usage:", "-f, --config", "-h, --help", "--version"} {
				if !strings.Contains(output.String(), want) {
					t.Errorf("help output %q does not contain %q", output.String(), want)
				}
			}
		})
	}
}

func TestParseCLIVersion(t *testing.T) {
	got, err := parseCLI([]string{"--version"}, io.Discard)
	if err != nil {
		t.Fatalf("parseCLI() error = %v", err)
	}
	if !got.showVersion {
		t.Fatal("parseCLI() showVersion = false, want true")
	}
}

func TestParseCLIErrors(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want string
	}{
		{name: "missing short value", args: []string{"-f"}, want: "flag needs an argument"},
		{name: "empty long value", args: []string{"--config="}, want: "configuration path must not be empty"},
		{name: "unknown flag", args: []string{"--unknown"}, want: "flag provided but not defined"},
		{name: "positional argument", args: []string{"config.yaml"}, want: "unexpected arguments"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := parseCLI(tt.args, io.Discard)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("parseCLI() error = %v, want error containing %q", err, tt.want)
			}
		})
	}
}

func TestCLIConfigOverridesEnvironment(t *testing.T) {
	base := func(name string) (string, bool) {
		values := map[string]string{
			"CONFIG_FILE":      "environment.yaml",
			"NAVI_SERVER_PORT": "9090",
		}
		value, ok := values[name]
		return value, ok
	}

	options := cliOptions{configFile: "command-line.yaml", configFileSet: true}
	lookup := options.lookupEnv(base)

	if got, ok := lookup("CONFIG_FILE"); !ok || got != "command-line.yaml" {
		t.Fatalf("CONFIG_FILE = %q, %v, want %q, true", got, ok, "command-line.yaml")
	}
	if got, ok := lookup("NAVI_SERVER_PORT"); !ok || got != "9090" {
		t.Fatalf("NAVI_SERVER_PORT = %q, %v, want %q, true", got, ok, "9090")
	}
}

func TestCLIUsesEnvironmentWithoutConfigFlag(t *testing.T) {
	base := func(name string) (string, bool) {
		if name == "CONFIG_FILE" {
			return "environment.yaml", true
		}
		return "", false
	}

	lookup := (cliOptions{}).lookupEnv(base)
	if got, ok := lookup("CONFIG_FILE"); !ok || got != "environment.yaml" {
		t.Fatalf("CONFIG_FILE = %q, %v, want %q, true", got, ok, "environment.yaml")
	}
}
