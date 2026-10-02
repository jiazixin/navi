package favicon

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"testing"
)

func testPNG(t *testing.T) []byte {
	t.Helper()
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func testWebP(t *testing.T) []byte {
	t.Helper()
	// A one-pixel image encoded using cwebp -lossless.
	contents, err := os.ReadFile("testdata/icon.webp")
	if err != nil {
		t.Fatal(err)
	}
	return contents
}

func testICO(t *testing.T) []byte {
	t.Helper()
	contents := testPNG(t)
	directory := make([]byte, 22)
	binary.LittleEndian.PutUint16(directory[2:4], 1)
	binary.LittleEndian.PutUint16(directory[4:6], 1)
	directory[6], directory[7] = 1, 1
	binary.LittleEndian.PutUint16(directory[10:12], 1)
	binary.LittleEndian.PutUint16(directory[12:14], 32)
	binary.LittleEndian.PutUint32(directory[14:18], uint32(len(contents)))
	binary.LittleEndian.PutUint32(directory[18:22], uint32(len(directory)))
	return append(directory, contents...)
}

func TestImageValidationAcceptsSupportedHeadersAndContainers(t *testing.T) {
	var jpegBuffer, gifBuffer bytes.Buffer
	sample := image.NewRGBA(image.Rect(0, 0, 1, 1))
	if err := jpeg.Encode(&jpegBuffer, sample, nil); err != nil {
		t.Fatal(err)
	}
	if err := gif.Encode(&gifBuffer, sample, nil); err != nil {
		t.Fatal(err)
	}
	for _, testCase := range []struct {
		contentType string
		contents    []byte
	}{
		{"image/png", testPNG(t)},
		{"image/jpeg", jpegBuffer.Bytes()},
		{"image/gif", gifBuffer.Bytes()},
		{"image/webp", testWebP(t)},
		{"image/x-icon", testICO(t)},
		{"image/svg+xml", []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>`)},
	} {
		if actual, ok := validatedContentType(testCase.contentType, testCase.contents); !ok || actual != testCase.contentType {
			t.Errorf("rejected supported %s: actual=%q, ok=%v", testCase.contentType, actual, ok)
		}
	}
}

func TestImageValidationRejectsTruncatedAndMalformedImages(t *testing.T) {
	webp := testWebP(t)
	incorrectRIFFSize := bytes.Clone(webp)
	binary.LittleEndian.PutUint32(incorrectRIFFSize[4:8], uint32(len(webp)))
	incorrectChunkSize := bytes.Clone(webp)
	binary.LittleEndian.PutUint32(incorrectChunkSize[16:20], ^uint32(0))
	ico := testICO(t)
	incorrectICOOffset := bytes.Clone(ico)
	binary.LittleEndian.PutUint32(incorrectICOOffset[18:22], ^uint32(0))
	incorrectICOSize := bytes.Clone(ico)
	binary.LittleEndian.PutUint32(incorrectICOSize[14:18], ^uint32(0))
	for _, testCase := range []struct {
		contentType string
		contents    []byte
	}{
		{"image/png", []byte("\x89PNG\r\n\x1a\nicon")},
		{"image/jpeg", []byte("\xff\xd8\xff")},
		{"image/gif", []byte("GIF89a")},
		{"image/webp", webp[:20]},
		{"image/webp", incorrectRIFFSize},
		{"image/webp", incorrectChunkSize},
		{"image/x-icon", ico[:22]},
		{"image/x-icon", incorrectICOOffset},
		{"image/x-icon", incorrectICOSize},
		{"image/svg+xml", []byte(`<svg>`)},
		{"image/svg+xml", []byte(`<svg-malformed/>`)},
		{"image/svg+xml", []byte(`<html><svg/></html>`)},
		{"image/svg+xml", []byte(`<svg/><svg/>`)},
		{"image/svg+xml", []byte(`<svg xmlns="https://other.test"/>`)},
	} {
		if _, ok := validatedContentType(testCase.contentType, testCase.contents); ok {
			t.Errorf("accepted malformed %s: %x", testCase.contentType, testCase.contents)
		}
	}
}

func TestRasterValidationRejectsOversizedDimensions(t *testing.T) {
	for _, format := range []string{"image/png", "image/jpeg", "image/gif"} {
		var buffer bytes.Buffer
		oversized := image.NewRGBA(image.Rect(0, 0, maxIconDimension+1, 1))
		var err error
		switch format {
		case "image/png":
			err = png.Encode(&buffer, oversized)
		case "image/jpeg":
			err = jpeg.Encode(&buffer, oversized, nil)
		case "image/gif":
			err = gif.Encode(&buffer, oversized, nil)
		}
		if err != nil {
			t.Fatal(err)
		}
		if _, ok := validatedContentType(format, buffer.Bytes()); ok {
			t.Errorf("accepted oversized %s", format)
		}
	}
	webp := testWebP(t)
	binary.LittleEndian.PutUint32(webp[21:25], maxIconDimension)
	if _, ok := validatedContentType("image/webp", webp); ok {
		t.Fatal("accepted oversized WebP")
	}
}
