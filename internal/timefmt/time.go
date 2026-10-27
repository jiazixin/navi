// Package timefmt defines the UTC millisecond representation used by stored timestamps.
package timefmt

import (
	"fmt"
	"time"
)

// Time serializes to UTC RFC 3339 with exactly three fractional digits.
type Time time.Time

// IsZero supports omission of absent timestamps.
func (t Time) IsZero() bool { return time.Time(t).IsZero() }

// MarshalText emits the canonical storage representation.
func (t Time) MarshalText() ([]byte, error) {
	return []byte(time.Time(t).UTC().Format("2006-01-02T15:04:05.000Z")), nil
}

// UnmarshalText accepts RFC 3339, including existing cache entries with nanoseconds.
// New writes always use the canonical millisecond format.
func (t *Time) UnmarshalText(text []byte) error {
	parsed, err := time.Parse(time.RFC3339Nano, string(text))
	if err != nil {
		return fmt.Errorf("parse stored timestamp: %w", err)
	}
	*t = Time(parsed.UTC())
	return nil
}
