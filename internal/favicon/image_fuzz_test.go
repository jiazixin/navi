package favicon

import "testing"

func FuzzValidateIcon(f *testing.F) {
	f.Fuzz(func(t *testing.T, header string, data []byte) {
		if len(data) > 65536 || len(header) > 256 {
			return
		}
		media, valid := validatedContentType(header, data)
		if valid && media == "" {
			t.Fatal("accepted icon without media type")
		}
	})
}
