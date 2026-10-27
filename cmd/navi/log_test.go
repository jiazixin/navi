package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"navi/internal/config"
)

func TestNewLoggerHonorsLevelAndJSONFormat(t *testing.T) {
	var output bytes.Buffer
	logger := newLogger(config.LoggingConfig{Level: "warn", Format: "json"}, &output)
	logger.Info("hidden")
	if output.Len() != 0 {
		t.Fatalf("info output = %q, want no output", output.String())
	}
	logger.Warn("visible", "count", 2)
	var record map[string]any
	if err := json.Unmarshal(output.Bytes(), &record); err != nil {
		t.Fatalf("decode JSON log: %v", err)
	}
	if record["msg"] != "visible" || record["count"] != float64(2) {
		t.Fatalf("record = %#v", record)
	}
}

func TestNewLoggerUsesLogfmtFormat(t *testing.T) {
	var output bytes.Buffer
	logger := newLogger(config.LoggingConfig{Level: "debug", Format: "logfmt"}, &output)
	logger.Debug("visible", "route", "/health")
	if !strings.Contains(output.String(), "msg=visible") || !strings.Contains(output.String(), "route=/health") {
		t.Fatalf("logfmt output = %q", output.String())
	}
}
