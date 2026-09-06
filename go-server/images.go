package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"io"
	"os"
	"path/filepath"
)

func (app *App) saveImage(file io.ReadSeeker) (string, error) {
	config, _, err := image.DecodeConfig(file)
	if err != nil {
		return "", fmt.Errorf("upload a PNG, JPEG, or GIF image")
	}
	if config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 16000000 {
		return "", fmt.Errorf("image must be at most 16 megapixels")
	}
	if _, err = file.Seek(0, 0); err != nil {
		return "", err
	}
	decoded, _, err := image.Decode(file)
	if err != nil {
		return "", fmt.Errorf("could not decode image")
	}
	id := make([]byte, 16)
	if _, err = rand.Read(id); err != nil {
		return "", err
	}
	name := hex.EncodeToString(id) + ".png"
	path := filepath.Join(app.Config.UploadsDir, name)
	dst, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", err
	}
	err = png.Encode(dst, decoded)
	closeErr := dst.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		os.Remove(path)
		return "", err
	}
	return "/uploads/" + name, nil
}
