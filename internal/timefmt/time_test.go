package timefmt

import (
	"testing"
	"time"
)

func TestCanonicalTime(t *testing.T) {
	t.Parallel()
	input := Time(time.Date(2026, 10, 27, 8, 9, 10, 123456789, time.FixedZone("fixture", 8*60*60)))
	got, err := input.MarshalText()
	if err != nil || string(got) != "2026-10-27T00:09:10.123Z" {
		t.Fatalf("got %q, %v, want UTC milliseconds", got, err)
	}
	var parsed Time
	if err := parsed.UnmarshalText(got); err != nil {
		t.Fatal(err)
	}
	if !time.Time(parsed).Equal(time.Time(input).Truncate(time.Millisecond)) {
		t.Fatal("round trip changed timestamp")
	}
	if err := parsed.UnmarshalText([]byte("invalid")); err == nil {
		t.Fatal("accepted malformed timestamp")
	}
}

func TestRejectsNonCanonicalTime(t *testing.T) {
	t.Parallel()
	for _, input := range []string{
		"2026-10-27T00:09:10Z",
		"2026-10-27T00:09:10.12Z",
		"2026-10-27T00:09:10.123456789Z",
		"2026-10-27T00:09:10.123+00:00",
		"2026-10-27T08:09:10.123+08:00",
		"2026-10-27T00:09:10,123Z",
	} {
		t.Run(input, func(t *testing.T) {
			var parsed Time
			if err := parsed.UnmarshalText([]byte(input)); err == nil {
				t.Fatalf("got accepted timestamp %q, want UTC with exactly three fractional digits", input)
			}
		})
	}
}
