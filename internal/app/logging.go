package app

import (
	"io"
	"log/slog"
	"os"

	"navi/internal/config"
)

// NewLogger creates the process logger from the validated logging settings.
// A nil writer uses stderr, while a supplied writer makes logging easy to test
// and embed without changing the process-wide slog default.
func NewLogger(settings config.LoggingConfig, writer io.Writer) *slog.Logger {
	if writer == nil {
		writer = os.Stderr
	}
	options := &slog.HandlerOptions{Level: loggingLevel(settings.Level)}
	if settings.Format == "logfmt" {
		return slog.New(slog.NewTextHandler(writer, options))
	}
	return slog.New(slog.NewJSONHandler(writer, options))
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
