package rules

import (
	"testing"
	"time"
)

func TestCooldownLadder(t *testing.T) {
	want := map[int]time.Duration{1: time.Minute, 2: time.Minute, 3: time.Minute, 4: 15 * time.Minute, 5: time.Hour, 6: 24 * time.Hour, 9: 24 * time.Hour}
	for hit, d := range want {
		if got := OTPCooldownForHit(hit); got != d {
			t.Fatalf("hit %d: got %v want %v", hit, got, d)
		}
	}
}

func TestMinimumAge13(t *testing.T) {
	today := time.Date(2026, 11, 7, 0, 0, 0, 0, time.UTC)
	if IsOldEnough(time.Date(2013, 11, 8, 0, 0, 0, 0, time.UTC), today) {
		t.Fatal("12 year old accepted")
	}
	if !IsOldEnough(time.Date(2013, 11, 7, 0, 0, 0, 0, time.UTC), today) {
		t.Fatal("13th birthday rejected")
	}
}
