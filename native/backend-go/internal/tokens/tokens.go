// Package tokens: short-lived signed access tokens + rotating, hashed, single-use refresh tokens.
// Refresh tokens belong to a "family" (one per sign-in). Presenting an already-used token means it
// leaked, so the whole family is revoked and the user must sign in again.
package tokens

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	AccessTTL  = 10 * time.Minute
	RefreshTTL = 90 * 24 * time.Hour // long-lived, but rotated on every use
)

var ErrInvalid = errors.New("invalid token")

type Pair struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"`
}

type Service struct {
	db  *pgxpool.Pool
	key []byte
}

func New(db *pgxpool.Pool, key []byte) *Service { return &Service{db: db, key: key} }

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func (s *Service) sign(payload string) string {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(payload))
	return b64(m.Sum(nil))
}

func hashToken(t string) string { h := sha256.Sum256([]byte(t)); return hex.EncodeToString(h[:]) }

func randomToken() string { b := make([]byte, 48); _, _ = rand.Read(b); return b64(b) }

func (s *Service) access(uid string) string {
	p := uid + "." + time.Now().Add(AccessTTL).Format(time.RFC3339)
	return b64([]byte(p)) + "." + s.sign(p)
}

func (s *Service) VerifyAccess(tok string) (string, error) {
	parts := strings.Split(tok, ".")
	if len(parts) != 2 {
		return "", ErrInvalid
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || !hmac.Equal([]byte(parts[1]), []byte(s.sign(string(raw)))) {
		return "", ErrInvalid
	}
	f := strings.SplitN(string(raw), ".", 2)
	exp, err := time.Parse(time.RFC3339, f[1])
	if err != nil || time.Now().After(exp) {
		return "", ErrInvalid
	}
	return f[0], nil
}

// Issue starts a new family on sign-in.
func (s *Service) Issue(ctx context.Context, uid, device string) (Pair, error) {
	rt := randomToken()
	family := randomToken()[:24]
	_, err := s.db.Exec(ctx, `insert into refresh_tokens(token_hash, family, user_id, device_hash, expires_at) values ($1,$2,$3,$4,$5)`,
		hashToken(rt), family, uid, device, time.Now().Add(RefreshTTL))
	return Pair{s.access(uid), rt, int(AccessTTL.Seconds())}, err
}

// Rotate consumes a refresh token and returns a new pair in the same family.
func (s *Service) Rotate(ctx context.Context, presented, device string) (Pair, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Pair{}, err
	}
	defer tx.Rollback(ctx)
	var family, uid, dev string
	var used bool
	var exp time.Time
	err = tx.QueryRow(ctx, `select family, user_id, device_hash, used, expires_at from refresh_tokens where token_hash=$1 for update`,
		hashToken(presented)).Scan(&family, &uid, &dev, &used, &exp)
	if err != nil {
		return Pair{}, ErrInvalid
	}
	if used || time.Now().After(exp) || dev != device {
		// Reuse (or a different device) => assume theft: kill the whole family.
		_, _ = s.db.Exec(ctx, `delete from refresh_tokens where family=$1`, family)
		return Pair{}, ErrInvalid
	}
	next := randomToken()
	if _, err = tx.Exec(ctx, `update refresh_tokens set used=true where token_hash=$1`, hashToken(presented)); err != nil {
		return Pair{}, err
	}
	if _, err = tx.Exec(ctx, `insert into refresh_tokens(token_hash, family, user_id, device_hash, expires_at) values ($1,$2,$3,$4,$5)`,
		hashToken(next), family, uid, device, time.Now().Add(RefreshTTL)); err != nil {
		return Pair{}, err
	}
	return Pair{s.access(uid), next, int(AccessTTL.Seconds())}, tx.Commit(ctx)
}

func (s *Service) RevokeAll(ctx context.Context, uid string) {
	_, _ = s.db.Exec(ctx, `delete from refresh_tokens where user_id=$1`, uid)
}

// SendCode / VerifyCode: one-time codes are stored hashed with a 10 minute expiry and 5-try limit.
func (s *Service) SendCode(ctx context.Context, email string) error {
	n := make([]byte, 4)
	_, _ = rand.Read(n)
	code := ""
	v := uint32(n[0])<<24 | uint32(n[1])<<16 | uint32(n[2])<<8 | uint32(n[3])
	for i := 0; i < 6; i++ {
		code += string(rune('0' + v%10))
		v /= 10
	}
	_, err := s.db.Exec(ctx, `insert into email_codes(email, code_hash, expires_at) values ($1,$2,now()+interval '10 minutes')`, email, hashToken(code+email))
	// TODO: deliver `code` and a magic link through the mail provider.
	return err
}

func (s *Service) VerifyCode(ctx context.Context, email, code string) (string, error) {
	var id int64
	err := s.db.QueryRow(ctx, `update email_codes set used=true where id = (
		select id from email_codes where email=$1 and code_hash=$2 and not used and expires_at>now() order by id desc limit 1) returning id`,
		email, hashToken(code+email)).Scan(&id)
	if err != nil {
		return "", ErrInvalid
	}
	var uid string
	err = s.db.QueryRow(ctx, `insert into users(email) values ($1) on conflict(email) do update set email=excluded.email returning id::text`, email).Scan(&uid)
	return uid, err
}
