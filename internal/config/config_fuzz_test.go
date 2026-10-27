package config

import (
	"bytes"
	"testing"
)

func FuzzDecodeConfig(f *testing.F) {
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 65536 {
			return
		}
		_, _ = decodeConfig(bytes.NewReader(data)) // Invalid input is an expected parse failure.
	})
}
