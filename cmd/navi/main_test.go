package main

import (
	"bytes"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunUsageErrors(t *testing.T) {
	for _, args := range [][]string{{"--bogus"}, {"-x"}, {"-c"}, {"--config="}, {"-c", "a", "-c", "b"}, {"config.yaml"}} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			if code := run(args, &stdout, &stderr); code != exitUsage {
				t.Fatalf("exit %d, want %d", code, exitUsage)
			}
			if stdout.Len() != 0 || !strings.HasPrefix(stderr.String(), "navi: ") || !strings.HasSuffix(stderr.String(), "Run 'navi --help' for usage.\n") {
				t.Fatalf("stdout %q, stderr %q", stdout.String(), stderr.String())
			}
		})
	}
}

func TestRunHelpAndVersionSkipConfiguration(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("CONFIG_FILE", "missing.yaml")
	for _, tc := range []struct {
		args []string
		want string
	}{
		{[]string{"-h"}, usage},
		{[]string{"--help"}, usage},
		{[]string{"-c", "missing.yaml", "--help"}, usage},
		{[]string{"--version"}, "navi " + currentBuild().String() + "\n"},
	} {
		t.Run(strings.Join(tc.args, " "), func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			if code := run(tc.args, &stdout, &stderr); code != exitOK {
				t.Fatalf("exit %d, stderr %q", code, stderr.String())
			}
			if stdout.String() != tc.want || stderr.Len() != 0 {
				t.Fatalf("stdout %q, stderr %q", stdout.String(), stderr.String())
			}
		})
	}
}

func TestRunBlankConfigFile(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("CONFIG_FILE", " ")
	var stdout, stderr bytes.Buffer
	if code := run(nil, &stdout, &stderr); code != exitFailure {
		t.Fatalf("exit %d, want %d", code, exitFailure)
	}
	if want := "navi: config: CONFIG_FILE is set but empty\n"; stdout.Len() != 0 || stderr.String() != want {
		t.Fatalf("stdout %q, stderr %q; want stderr %q", stdout.String(), stderr.String(), want)
	}
}

func TestRunConfigSelection(t *testing.T) {
	t.Chdir(t.TempDir())
	dir := t.TempDir()
	flagFile, envFile := filepath.Join(dir, "flag.yaml"), filepath.Join(dir, "env.yaml")
	t.Setenv("CONFIG_FILE", envFile)
	for _, tc := range []struct {
		name          string
		args          []string
		want, notWant string
	}{
		{"environment", []string{}, envFile, flagFile},
		{"flag beats environment", []string{"-c", flagFile}, flagFile, envFile},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			if code := run(tc.args, &stdout, &stderr); code != exitFailure {
				t.Fatalf("exit %d, want %d", code, exitFailure)
			}
			got := stderr.String()
			if stdout.Len() != 0 || !strings.HasPrefix(got, "navi: config: stat "+tc.want+": ") || strings.Count(got, "\n") != 1 || !strings.Contains(got, tc.want) || strings.Contains(got, tc.notWant) {
				t.Fatalf("stdout %q, stderr %q", stdout.String(), got)
			}
		})
	}
}

func TestRunLogsFailuresAfterLoggerIsReady(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	busy, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer busy.Close()
	port := busy.Addr().(*net.TCPAddr).Port
	catalog := "version: 1\npages:\n  - {id: page1, title: Navi, urls: []}\n"
	settings := fmt.Sprintf("storage: ./cache\nserver: {listen: 127.0.0.1, port: %d}\ncatalog: {path: ./urls.yaml, watch: false}\n", port)
	for name, contents := range map[string]string{"urls.yaml": catalog, "config.yaml": settings} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(contents), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	var stdout, stderr bytes.Buffer
	if code := run([]string{"-c", "config.yaml"}, &stdout, &stderr); code != exitFailure {
		t.Fatalf("exit %d, want %d", code, exitFailure)
	}
	got := stdout.String()
	if stderr.Len() != 0 || !strings.Contains(got, `"msg":"service_starting"`) || !strings.Contains(got, `"msg":"service_failed"`) {
		t.Fatalf("stdout %q, stderr %q", got, stderr.String())
	}
}
