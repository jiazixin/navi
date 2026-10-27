package main

import (
	"io"
	"log/slog"

	"navi/internal/config"
)

// newLogger creates the process logger from the validated logging settings.
// Navi logs only to the given writer (stdout), so there is nothing to close.
func newLogger(settings config.LoggingConfig, w io.Writer) (*slog.Logger, func() error, error) {
	options := &slog.HandlerOptions{Level: loggingLevel(settings.Level)}
	closeLog := func() error { return nil }
	if settings.Format == "logfmt" {
		return slog.New(slog.NewTextHandler(w, options)), closeLog, nil
	}
	return slog.New(slog.NewJSONHandler(w, options)), closeLog, nil
}

func loggingLevel(value string) slog.Level {
	switch value {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
