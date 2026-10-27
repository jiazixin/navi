package timefmt

import (
	"errors"
	"fmt"
	"time"
)

const timestampLayout = "2006-01-02T15:04:05.000Z"

// Time serializes to UTC RFC 3339 with exactly three fractional digits.
type Time time.Time

// IsZero supports omission of absent timestamps.
func (t Time) IsZero() bool { return time.Time(t).IsZero() }

// MarshalText emits the canonical storage representation.
func (t Time) MarshalText() ([]byte, error) {
	return []byte(time.Time(t).UTC().Format(timestampLayout)), nil
}

// UnmarshalText accepts only UTC timestamps with exactly three fractional digits.
func (t *Time) UnmarshalText(text []byte) error {
	parsed, err := time.Parse(timestampLayout, string(text))
	if err != nil {
		return fmt.Errorf("parse stored timestamp: %w", err)
	}
	if parsed.Format(timestampLayout) != string(text) {
		return errors.New("stored timestamp must use UTC with exactly three fractional digits")
	}
	*t = Time(parsed)
	return nil
}
