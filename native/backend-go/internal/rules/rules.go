// Package rules mirrors src/lib/rules.ts and the Kotlin Rules object.
package rules

import (
	"regexp"
	"strings"
	"time"
	"unicode"
)

var usernameRe = regexp.MustCompile(`^[a-z0-9_.]{3,24}$`)
var e164Re = regexp.MustCompile(`^\+[1-9][0-9]{6,14}$`)

func OTPCooldownForHit(hit int) time.Duration {
	switch {
	case hit <= 3:
		return time.Minute
	case hit == 4:
		return 15 * time.Minute
	case hit == 5:
		return time.Hour
	default:
		return 24 * time.Hour
	}
}

// IsOldEnough enforces the minimum age of 13 (server side, authoritative).
func IsOldEnough(dob time.Time, today time.Time) bool {
	age := today.Year() - dob.Year()
	if today.Month() < dob.Month() || (today.Month() == dob.Month() && today.Day() < dob.Day()) {
		age--
	}
	return age >= 13 && age <= 120
}

// Sanitize removes control/invisible characters and angle brackets and collapses whitespace.
func Sanitize(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == '<' || r == '>':
		case unicode.IsControl(r) && r != '\n':
		case r >= 0x200B && r <= 0x200F, r >= 0x202A && r <= 0x202E, r >= 0x2060 && r <= 0x2064, r == 0xFEFF:
		default:
			b.WriteRune(r)
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

type Profile struct {
	FullName, Username, Phone, Gender, Bio, Location string
	DOB                                              time.Time
}

// ValidateProfile returns the cleaned profile or the name of the first invalid field.
func ValidateProfile(name, username, phone, country, gender, dob, bio, loc string, now time.Time) (Profile, string) {
	p := Profile{FullName: Sanitize(name), Username: strings.ToLower(strings.TrimSpace(username)), Phone: phone,
		Gender: gender, Bio: Sanitize(bio), Location: Sanitize(loc)}
	if n := len([]rune(p.FullName)); n < 2 || n > 60 {
		return p, "fullName"
	}
	if !usernameRe.MatchString(p.Username) {
		return p, "username"
	}
	if !e164Re.MatchString(p.Phone) || len(country) != 2 {
		return p, "phone"
	}
	switch gender {
	case "male", "female", "other", "prefer_not":
	default:
		return p, "gender"
	}
	t, err := time.Parse("2006-01-02", dob)
	if err != nil || !IsOldEnough(t, now) {
		return p, "dateOfBirth"
	}
	p.DOB = t
	if len([]rune(p.Bio)) > 150 {
		return p, "bio"
	}
	if len([]rune(p.Location)) > 120 {
		p.Location = string([]rune(p.Location)[:120])
	}
	return p, ""
}
