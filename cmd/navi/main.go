// Command navi serves the Navi personal start page.
package main

import (
	"cmp"
	"context"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"navi/internal/app"
	"navi/internal/config"
)

const (
	exitOK      = 0
	exitFailure = 1
	exitUsage   = 2
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

// run reports usage and startup errors as plain text on stderr; once the
// logger is ready, failures are logged.
func run(args []string, stdout, stderr io.Writer) int {
	opts, err := parseArgs(args)
	if err != nil {
		fmt.Fprintf(stderr, "navi: %v\nRun 'navi --help' for usage.\n", err)
		return exitUsage
	}
	build := currentBuild()
	switch {
	case opts.help:
		fmt.Fprint(stdout, usage)
		return exitOK
	case opts.version:
		fmt.Fprintln(stdout, "navi", build)
		return exitOK
	}
	path, explicit, err := opts.configPath(os.LookupEnv)
	if err != nil {
		fmt.Fprintf(stderr, "navi: config: %v\n", err)
		return exitFailure
	}
	workDir, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(stderr, "navi: config: %v\n", err)
		return exitFailure
	}
	cfg, err := config.Load(config.Source{Path: path, Explicit: explicit, WorkDir: workDir, LookupEnv: os.LookupEnv})
	if err != nil {
		fmt.Fprintf(stderr, "navi: config: %v\n", err)
		return exitFailure
	}
	logger, closeLog, err := newLogger(cfg.Logging, stdout)
	if err != nil {
		fmt.Fprintf(stderr, "navi: log: %v\n", err)
		return exitFailure
	}
	defer func() {
		if err := closeLog(); err != nil {
			fmt.Fprintf(stderr, "navi: log: %v\n", err)
		}
	}()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	context.AfterFunc(ctx, stop) // a second signal terminates the process
	logger.Info("service_starting",
		"version", build.String(),
		"commit", cmp.Or(build.Revision, "unknown"),
		"build_time", cmp.Or(build.Time, "unknown"),
	)
	if err := app.Run(ctx, cfg, logger, build.String()); err != nil {
		logger.Error("service_failed", "error", err)
		return exitFailure
	}
	logger.Info("service_stopped")
	return exitOK
}
