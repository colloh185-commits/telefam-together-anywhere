// Package ratelimit: atomic per-account / per-device / per-IP limits stored in Postgres (works across instances).
package ratelimit

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Limiter struct{ db *pgxpool.Pool }

func New(db *pgxpool.Pool) *Limiter { return &Limiter{db: db} }

// Window allows `limit` hits per window; returns seconds to wait (0 = allowed). Fails closed.
func (l *Limiter) Window(ctx context.Context, key string, limit int, window time.Duration) int {
	var r int
	if err := l.db.QueryRow(ctx, `select public.throttle_hit($1,'window',$2,$3)`, key, limit, int(window.Seconds())).Scan(&r); err != nil {
		return 60
	}
	return max(r, 0)
}

// Ladder applies the resend ladder: 1 min x3, then 15 min, 1 hour, 1 day.
// Returns (wait, cooldown): wait > 0 means blocked; otherwise cooldown is the delay applied after this send.
func (l *Limiter) Ladder(ctx context.Context, key string) (int, int) {
	var r int
	if err := l.db.QueryRow(ctx, `select public.throttle_hit($1,'ladder',0,86400)`, key).Scan(&r); err != nil {
		return 60, 0
	}
	if r < 0 {
		return 0, -r
	}
	return r, 0
}

func (l *Limiter) Reset(ctx context.Context, key string) {
	_, _ = l.db.Exec(ctx, `select public.throttle_reset($1)`, key)
}
