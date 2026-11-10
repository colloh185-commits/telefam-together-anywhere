package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"telefam.app/backend/internal/media"
	"telefam.app/backend/internal/ratelimit"
	"telefam.app/backend/internal/rules"
	"telefam.app/backend/internal/tokens"
)

type Server struct {
	db     *pgxpool.Pool
	tokens *tokens.Service
	rl     *ratelimit.Limiter
	pepper []byte
}

func New(db *pgxpool.Pool, signingKey, pepper []byte) *Server {
	return &Server{db: db, tokens: tokens.New(db, signingKey), rl: ratelimit.New(db), pepper: pepper}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/auth/code", s.requestCode)
	mux.HandleFunc("POST /v1/auth/verify", s.verifyCode)
	mux.HandleFunc("POST /v1/auth/refresh", s.refresh)
	mux.HandleFunc("POST /v1/auth/logout", s.auth(s.logout))
	mux.HandleFunc("POST /v1/profile", s.auth(s.saveProfile))
	mux.HandleFunc("POST /v1/media/avatar", s.auth(s.uploadAvatar))
	mux.HandleFunc("POST /v1/events", s.auth(s.events))
	return secure(mux)
}

// secure adds headers, request size limits and JSON-only content types.
func secure(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		r.Body = http.MaxBytesReader(w, r.Body, 3<<20)
		next.ServeHTTP(w, r)
	})
}

func (s *Server) hash(kind, v string) string {
	m := hmac.New(sha256.New, s.pepper)
	m.Write([]byte(kind + ":" + v))
	return hex.EncodeToString(m.Sum(nil))
}

func clientIP(r *http.Request) string {
	if v := r.Header.Get("X-Forwarded-For"); v != "" { // set by the trusted proxy only
		return strings.TrimSpace(strings.Split(v, ",")[0])
	}
	h, _, _ := net.SplitHostPort(r.RemoteAddr)
	return h
}

var deviceRe = regexp.MustCompile(`^[a-f0-9]{64}$`)

type fp struct{ ip, dev string }

func (s *Server) fingerprints(r *http.Request, device string) fp {
	if !deviceRe.MatchString(device) {
		device = "unknown"
	}
	return fp{ip: s.hash("ip", clientIP(r)), dev: s.hash("dev", device)}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func decode(r *http.Request, v any) bool {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v) == nil
}

func (s *Server) log(r *http.Request, user *string, event string, f fp, meta map[string]any) {
	b, _ := json.Marshal(meta)
	// Parameterized query: user input is never concatenated into SQL.
	_, _ = s.db.Exec(r.Context(), `insert into activity_logs(user_id, event, ip_hash, device_hash, meta) values ($1,$2,$3,$4,$5)`,
		user, event, f.ip, f.dev, b)
}

// ---- auth ----

var emailRe = regexp.MustCompile(`^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$`)

func (s *Server) requestCode(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Device string }
	if !decode(r, &in) || !emailRe.MatchString(strings.ToLower(in.Email)) {
		writeJSON(w, 400, map[string]any{"ok": false, "retryAfter": 0})
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	f := s.fingerprints(r, in.Device)
	ctx := r.Context()

	if wait := s.rl.Window(ctx, "otp:ip:"+f.ip, 20, time.Hour); wait > 0 {
		writeJSON(w, 200, map[string]any{"ok": false, "retryAfter": wait})
		return
	}
	if wait := s.rl.Window(ctx, "otp:dev:"+f.dev, 10, time.Hour); wait > 0 {
		writeJSON(w, 200, map[string]any{"ok": false, "retryAfter": wait})
		return
	}
	wait, cooldown := s.rl.Ladder(ctx, "otp:email:"+s.hash("email", email))
	if wait > 0 {
		writeJSON(w, 200, map[string]any{"ok": false, "retryAfter": wait})
		return
	}
	if err := s.tokens.SendCode(ctx, email); err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "retryAfter": 60})
		return
	}
	s.log(r, nil, "auth.code_sent", f, nil)
	writeJSON(w, 200, map[string]any{"ok": true, "retryAfter": cooldown})
}

func (s *Server) verifyCode(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Code, Device string }
	if !decode(r, &in) || !regexp.MustCompile(`^[0-9]{6,8}$`).MatchString(in.Code) {
		writeJSON(w, 400, map[string]any{"ok": false})
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	f := s.fingerprints(r, in.Device)
	ctx := r.Context()
	for _, c := range []struct {
		key   string
		limit int
		win   time.Duration
	}{{"ver:ip:" + f.ip, 60, time.Hour}, {"ver:dev:" + f.dev, 25, time.Hour}, {"ver:email:" + s.hash("email", email), 6, 15 * time.Minute}} {
		if wait := s.rl.Window(ctx, c.key, c.limit, c.win); wait > 0 {
			writeJSON(w, 429, map[string]any{"ok": false, "retryAfter": wait})
			return
		}
	}
	userID, err := s.tokens.VerifyCode(ctx, email, in.Code)
	if err != nil {
		s.log(r, nil, "auth.verify_failed", f, nil)
		writeJSON(w, 401, map[string]any{"ok": false})
		return
	}
	pair, err := s.tokens.Issue(ctx, userID, f.dev)
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false})
		return
	}
	s.rl.Reset(ctx, "ver:email:"+s.hash("email", email))
	s.log(r, &userID, "auth.signed_in", f, map[string]any{"via": "code"})
	writeJSON(w, 200, pair)
}

func (s *Server) refresh(w http.ResponseWriter, r *http.Request) {
	var in struct{ RefreshToken, Device string }
	if !decode(r, &in) {
		writeJSON(w, 400, nil)
		return
	}
	f := s.fingerprints(r, in.Device)
	pair, err := s.tokens.Rotate(r.Context(), in.RefreshToken, f.dev)
	if err != nil {
		// Reuse of an old token revokes the whole family inside Rotate().
		s.log(r, nil, "auth.refresh_rejected", f, nil)
		writeJSON(w, 401, map[string]any{"ok": false})
		return
	}
	writeJSON(w, 200, pair)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request, uid string) {
	s.tokens.RevokeAll(r.Context(), uid)
	w.WriteHeader(204)
}

// ---- authenticated ----

type authed func(http.ResponseWriter, *http.Request, string)

func (s *Server) auth(next authed) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := s.tokens.VerifyAccess(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		if err != nil {
			writeJSON(w, 401, map[string]any{"ok": false})
			return
		}
		next(w, r, uid)
	}
}

func (s *Server) saveProfile(w http.ResponseWriter, r *http.Request, uid string) {
	var in struct {
		FullName, Username, PhoneE164, PhoneCountry, Gender, DateOfBirth, Bio, Location string
		AvatarMediaID                                                                    *string
	}
	if !decode(r, &in) {
		writeJSON(w, 400, map[string]any{"ok": false, "field": "form"})
		return
	}
	v, field := rules.ValidateProfile(in.FullName, in.Username, in.PhoneE164, in.PhoneCountry, in.Gender, in.DateOfBirth, in.Bio, in.Location, time.Now())
	if field != "" {
		writeJSON(w, 422, map[string]any{"ok": false, "field": field})
		return
	}
	_, err := s.db.Exec(r.Context(), `
		insert into profiles(id, full_name, username, phone_country, phone_e164, gender, date_of_birth, bio, location_label, avatar_media_id)
		values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		on conflict (id) do update set full_name=excluded.full_name, username=excluded.username, phone_country=excluded.phone_country,
		  phone_e164=excluded.phone_e164, gender=excluded.gender, date_of_birth=excluded.date_of_birth, bio=excluded.bio,
		  location_label=excluded.location_label, avatar_media_id=excluded.avatar_media_id`,
		uid, v.FullName, v.Username, in.PhoneCountry, v.Phone, v.Gender, v.DOB, v.Bio, v.Location, in.AvatarMediaID)
	if err != nil {
		writeJSON(w, 409, map[string]any{"ok": false, "field": "username"}) // unique violation
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) uploadAvatar(w http.ResponseWriter, r *http.Request, uid string) {
	clean, err := media.SanitizeAvatar(r.Body)
	if err != nil {
		writeJSON(w, 422, map[string]any{"ok": false})
		return
	}
	id, path, err := media.Store(r.Context(), s.db, uid, clean)
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "mediaId": id, "path": path})
}

func (s *Server) events(w http.ResponseWriter, r *http.Request, uid string) {
	var in struct {
		Events []struct {
			Event string
			Ts    string
			Meta  map[string]any
		}
		Device string
	}
	if !decode(r, &in) || len(in.Events) == 0 || len(in.Events) > 25 {
		writeJSON(w, 400, nil)
		return
	}
	f := s.fingerprints(r, in.Device)
	ev := regexp.MustCompile(`^[a-z0-9_.]{2,64}$`)
	for _, e := range in.Events {
		if ev.MatchString(e.Event) {
			s.log(r, &uid, e.Event, f, e.Meta)
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
