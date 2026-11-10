// Telefam API for the native apps. Same rules as the web server functions.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"telefam.app/backend/internal/api"
)

func main() {
	ctx := context.Background()
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		slog.Error("db", "err", err)
		os.Exit(1)
	}
	srv := &http.Server{
		Addr:              ":" + envOr("PORT", "8080"),
		Handler:           api.New(db, []byte(os.Getenv("TOKEN_SIGNING_KEY")), []byte(os.Getenv("FINGERPRINT_PEPPER"))).Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      20 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	slog.Info("listening", "addr", srv.Addr)
	if err := srv.ListenAndServe(); err != nil {
		slog.Error("server", "err", err)
	}
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
