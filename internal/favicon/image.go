package favicon

import (
	"bytes"
	"encoding/binary"
	"encoding/xml"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net/http"
	"strings"
)

// Favicons are displayed at small sizes, including on high-DPI screens. Limit
// raster dimensions before a compact remote image reaches a browser decoder.
const maxIconDimension = 2048

// Validate image headers and container boundaries before persisting a remote
// response. MIME signatures alone accept truncated files that browsers reject.
func validatedContentType(header string, contents []byte) (string, bool) {
	mediaType, _, err := mime.ParseMediaType(header)
	if err == nil && mediaType == "image/svg+xml" && isSVG(contents) {
		return "image/svg+xml", true
	}
	detected := http.DetectContentType(contents)
	switch detected {
	case "image/png", "image/jpeg", "image/gif":
		return detected, validRasterConfig(contents)
	case "image/webp":
		return detected, validWebP(contents)
	case "image/x-icon", "image/vnd.microsoft.icon":
		return "image/x-icon", validICO(contents)
	}
	return "", false
}

func validRasterConfig(contents []byte) bool {
	config, _, err := image.DecodeConfig(bytes.NewReader(contents))
	return err == nil && config.Width > 0 && config.Height > 0 && config.Width <= maxIconDimension && config.Height <= maxIconDimension
}

func isSVG(contents []byte) bool {
	decoder := xml.NewDecoder(bytes.NewReader(bytes.TrimPrefix(contents, []byte("\xef\xbb\xbf"))))
	depth := 0
	hasRoot := false
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return hasRoot && depth == 0
		}
		if err != nil {
			return false
		}
		switch token := token.(type) {
		case xml.StartElement:
			if depth == 0 {
				if hasRoot || token.Name.Local != "svg" || (token.Name.Space != "" && token.Name.Space != "http://www.w3.org/2000/svg") {
					return false
				}
				hasRoot = true
			}
			depth++
		case xml.EndElement:
			depth--
		case xml.CharData:
			if depth == 0 && strings.TrimSpace(string(token)) != "" {
				return false
			}
		}
	}
}

func validICO(contents []byte) bool {
	if len(contents) < 6 || binary.LittleEndian.Uint16(contents[:2]) != 0 || binary.LittleEndian.Uint16(contents[2:4]) != 1 {
		return false
	}
	count := int(binary.LittleEndian.Uint16(contents[4:6]))
	directoryEnd := 6 + count*16
	if count == 0 || directoryEnd > len(contents) {
		return false
	}
	for index := range count {
		entry := contents[6+index*16 : 6+(index+1)*16]
		size := uint64(binary.LittleEndian.Uint32(entry[8:12]))
		offset := uint64(binary.LittleEndian.Uint32(entry[12:16]))
		if size < 12 || offset < uint64(directoryEnd) || offset+size > uint64(len(contents)) {
			return false
		}
		body := contents[offset : offset+size]
		if bytes.HasPrefix(body, []byte("\x89PNG\r\n\x1a\n")) {
			if !validRasterConfig(body) {
				return false
			}
			continue
		}
		headerSize := binary.LittleEndian.Uint32(body[:4])
		var width, height int64
		switch {
		case headerSize == 12: // BITMAPCOREHEADER
			width, height = int64(binary.LittleEndian.Uint16(body[4:6])), int64(binary.LittleEndian.Uint16(body[6:8]))
		case headerSize >= 40 && uint64(headerSize) <= size: // BITMAPINFOHEADER and later
			width, height = int64(int32(binary.LittleEndian.Uint32(body[4:8]))), int64(int32(binary.LittleEndian.Uint32(body[8:12])))
		default:
			return false
		}
		// ICO bitmap height includes the equally sized transparency mask.
		if height < 0 {
			height = -height
		}
		if width <= 0 || width > maxIconDimension || height <= 0 || height%2 != 0 || height/2 > maxIconDimension {
			return false
		}
	}
	return true
}

func validWebP(contents []byte) bool {
	if len(contents) < 20 || string(contents[:4]) != "RIFF" || string(contents[8:12]) != "WEBP" || uint64(binary.LittleEndian.Uint32(contents[4:8]))+8 != uint64(len(contents)) {
		return false
	}
	return validWebPChunks(contents[12:], false)
}

func validWebPChunks(contents []byte, frame bool) bool {
	hasImage := false
	for len(contents) > 0 {
		if len(contents) < 8 {
			return false
		}
		chunkType := string(contents[:4])
		length := uint64(binary.LittleEndian.Uint32(contents[4:8]))
		end := 8 + length
		paddedEnd := end + length%2
		if paddedEnd > uint64(len(contents)) {
			return false
		}
		body := contents[8:end]
		switch chunkType {
		case "VP8 ":
			if len(body) < 10 || body[0]&1 != 0 || !bytes.Equal(body[3:6], []byte{0x9d, 0x01, 0x2a}) {
				return false
			}
			width, height := binary.LittleEndian.Uint16(body[6:8])&0x3fff, binary.LittleEndian.Uint16(body[8:10])&0x3fff
			if width == 0 || height == 0 || width > maxIconDimension || height > maxIconDimension {
				return false
			}
			hasImage = true
		case "VP8L":
			if len(body) < 5 || body[0] != 0x2f || body[4]&0xe0 != 0 {
				return false
			}
			dimensions := binary.LittleEndian.Uint32(body[1:5])
			width, height := (dimensions&0x3fff)+1, ((dimensions>>14)&0x3fff)+1
			if width > maxIconDimension || height > maxIconDimension {
				return false
			}
			hasImage = true
		case "VP8X":
			if frame || len(body) != 10 || webPDimension(body[4:7]) > maxIconDimension || webPDimension(body[7:10]) > maxIconDimension {
				return false
			}
		case "ANMF":
			if frame || len(body) < 16 || webPDimension(body[6:9]) > maxIconDimension || webPDimension(body[9:12]) > maxIconDimension || !validWebPChunks(body[16:], true) {
				return false
			}
			hasImage = true
		}
		contents = contents[paddedEnd:]
	}
	return hasImage
}

func webPDimension(value []byte) uint32 {
	return (uint32(value[0]) | uint32(value[1])<<8 | uint32(value[2])<<16) + 1
}
