// Package media: sniff -> decode -> center-crop -> resize -> re-encode (drops metadata/payloads),
// then fingerprint (sha256 + 64-bit dHash) and store under a random id so uploaded names are never used.
package media

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png"
	"io"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	maxBytes = 2 << 20
	outSize  = 512
)

type Clean struct {
	Bytes         []byte
	SHA256, DHash string
}

func SanitizeAvatar(r io.Reader) (*Clean, error) {
	raw, err := io.ReadAll(io.LimitReader(r, maxBytes+1))
	if err != nil || len(raw) < 100 || len(raw) > maxBytes {
		return nil, errors.New("size")
	}
	// Real content sniffing: never trust the extension or declared Content-Type.
	switch {
	case bytes.HasPrefix(raw, []byte{0xFF, 0xD8, 0xFF}), bytes.HasPrefix(raw, []byte("\x89PNG")), bytes.HasPrefix(raw[min(len(raw), 8):], []byte("WEBP")):
	default:
		return nil, errors.New("type")
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || cfg.Width < 64 || cfg.Height < 64 || cfg.Width > 4096 || cfg.Height > 4096 {
		return nil, errors.New("dimensions")
	}
	src, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, errors.New("decode")
	}
	b := src.Bounds()
	side := min(b.Dx(), b.Dy())
	crop := image.Rect(b.Min.X+(b.Dx()-side)/2, b.Min.Y+(b.Dy()-side)/2, b.Min.X+(b.Dx()-side)/2+side, b.Min.Y+(b.Dy()-side)/2+side)
	dst := image.NewRGBA(image.Rect(0, 0, outSize, outSize))
	draw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, crop, draw.Over, nil)

	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: 82}); err != nil {
		return nil, err
	}
	sum := sha256.Sum256(out.Bytes())
	return &Clean{Bytes: out.Bytes(), SHA256: hex.EncodeToString(sum[:]), DHash: dhash(dst)}, nil
}

func dhash(img *image.RGBA) string {
	var bits uint64
	const w, h = 9, 8
	var g [h][w]float64
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			c := img.RGBAAt((2*x+1)*outSize/(2*w), (2*y+1)*outSize/(2*h))
			g[y][x] = 0.299*float64(c.R) + 0.587*float64(c.G) + 0.114*float64(c.B)
		}
	}
	for y := 0; y < h; y++ {
		for x := 0; x < w-1; x++ {
			bits <<= 1
			if g[y][x] > g[y][x+1] {
				bits |= 1
			}
		}
	}
	return fmt.Sprintf("%016x", bits)
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// Store writes the object as <user>/<random-uuid>.jpg (object storage client elided) and records the fingerprint.
func Store(ctx context.Context, db *pgxpool.Pool, uid string, c *Clean) (id, path string, err error) {
	id = newID()
	path = uid + "/" + id + ".jpg"
	// putObject(ctx, "avatars", path, c.Bytes, "image/jpeg")  // S3/GCS/Supabase Storage client
	_, err = db.Exec(ctx, `insert into media_assets(id, owner_id, kind, storage_path, mime, bytes, width, height, sha256, dhash)
		values ($1,$2,'avatar',$3,'image/jpeg',$4,$5,$5,$6,$7)`, id, uid, path, len(c.Bytes), outSize, c.SHA256, c.DHash)
	return
}
