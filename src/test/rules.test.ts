import { describe, expect, it } from "vitest";
import { isOldEnough, nameFromEmail, otpCooldownForHit, sanitizeText, usernameFromEmail } from "@/lib/rules";

describe("code resend cooldown", () => {
  it("waits 1 minute for the first three requests", () => {
    expect([1, 2, 3].map(otpCooldownForHit)).toEqual([60, 60, 60]);
  });
  it("then 15 minutes", () => {
    expect(otpCooldownForHit(4)).toBe(900);
  });
  it("then 1 hour", () => {
    expect(otpCooldownForHit(5)).toBe(3600);
  });
  it("then 1 day", () => {
    expect(otpCooldownForHit(6)).toBe(86400);
    expect(otpCooldownForHit(9)).toBe(86400);
  });
});

describe("minimum age 13", () => {
  const today = new Date(Date.UTC(2026, 10, 7));
  it("rejects someone who is 12", () => {
    expect(isOldEnough("2013-11-08", today)).toBe(false);
  });
  it("accepts someone who turns 13 today", () => {
    expect(isOldEnough("2013-11-07", today)).toBe(true);
  });
  it("rejects impossible dates", () => {
    expect(isOldEnough("2001-02-30", today)).toBe(false);
  });
});

describe("autofill from email", () => {
  it("builds username from prefix", () => {
    expect(usernameFromEmail("Jane.Doe+tag@example.com")).toBe("jane.doe");
    expect(usernameFromEmail("a@x.com")).toBe("a00");
  });
  it("builds name from prefix", () => {
    expect(nameFromEmail("jane.doe99@example.com")).toBe("Jane Doe");
  });
});

describe("input sanitizing", () => {
  it("removes angle brackets and control chars", () => {
    expect(sanitizeText("<script>hi</script>\u0000 there")).toBe("scripthi/script there");
  });
});
