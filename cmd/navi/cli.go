package main

import (
	"flag"
	"fmt"
	"io"
	"strings"
)

const cliHelp = `Usage:
  navi [options]

Options:
  -c, --config PATH  configuration file (overrides CONFIG_FILE)
  -h, --help         show this help
      --version      show version information

Without -c or --config, CONFIG_FILE selects the configuration file.
The default is ./configs/config.local.yaml.
`

type cliOptions struct {
	configFile    string
	configFileSet bool
	showVersion   bool
}

func parseCLI(args []string, output io.Writer) (cliOptions, error) {
	var options cliOptions
	flags := flag.NewFlagSet("navi", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.Usage = func() {
		_, _ = fmt.Fprint(output, cliHelp)
	}
	var shortConfig, longConfig string
	flags.StringVar(&shortConfig, "c", "", "configuration file")
	flags.StringVar(&longConfig, "config", "", "configuration file")
	flags.BoolVar(&options.showVersion, "version", false, "show version information")

	if err := flags.Parse(args); err != nil {
		return cliOptions{}, err
	}
	if flags.NArg() != 0 {
		return cliOptions{}, fmt.Errorf("unexpected arguments: %s", strings.Join(flags.Args(), " "))
	}

	var configError error
	flags.Visit(func(current *flag.Flag) {
		if current.Name == "c" || current.Name == "config" {
			options.configFileSet = true
			if strings.TrimSpace(current.Value.String()) == "" {
				configError = fmt.Errorf("configuration path must not be empty")
			}
		}
	})
	if configError != nil {
		return cliOptions{}, configError
	}
	if shortConfig != "" && longConfig != "" && shortConfig != longConfig {
		return cliOptions{}, fmt.Errorf("-c and --config must specify the same path")
	}
	options.configFile = shortConfig
	if longConfig != "" {
		options.configFile = longConfig
	}

	return options, nil
}

func (options cliOptions) lookupEnv(base func(string) (string, bool)) func(string) (string, bool) {
	if !options.configFileSet {
		return base
	}
	return func(name string) (string, bool) {
		if name == "CONFIG_FILE" {
			return options.configFile, true
		}
		if base == nil {
			return "", false
		}
		return base(name)
	}
}
