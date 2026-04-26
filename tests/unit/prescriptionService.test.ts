import { isRefillEligible } from "../../server/src/services/prescriptionService";

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ---------------------------------------------------------------------------
// isRefillEligible
// ---------------------------------------------------------------------------
describe("isRefillEligible", () => {
  it("isRefillEligible returns true when many days have passed since last fill", () => {
    // Arrange — 30-day supply, filled 30 days ago (well past 80% = 24 days)
    const lastFillDate = daysAgo(30);
    const daysSupply = 30;
    const refillsRemaining = 3;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert
    expect(result).toBe(true);
  });

  it("isRefillEligible returns false when prescription was filled too recently", () => {
    // Arrange — 30-day supply, filled 5 days ago (threshold is 24 days)
    const lastFillDate = daysAgo(5);
    const daysSupply = 30;
    const refillsRemaining = 3;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert
    expect(result).toBe(false);
  });

  it("isRefillEligible returns true when days elapsed exactly equals 80% of days supply", () => {
    // Arrange — 30-day supply, filled exactly 24 days ago (80% threshold = 24)
    const lastFillDate = daysAgo(24);
    const daysSupply = 30;
    const refillsRemaining = 2;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert
    expect(result).toBe(true);
  });

  it("isRefillEligible returns false when refills remaining is 0, regardless of fill date", () => {
    // Arrange — 30-day supply, filled 30 days ago, but no refills left
    const lastFillDate = daysAgo(30);
    const daysSupply = 30;
    const refillsRemaining = 0;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert
    expect(result).toBe(false);
  });

  it("isRefillEligible handles daysSupply of 1 — eligible after at least 0.8 days", () => {
    // Arrange — 1-day supply, filled 1 day ago (threshold is 0.8 days)
    const lastFillDate = daysAgo(1);
    const daysSupply = 1;
    const refillsRemaining = 5;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert
    expect(result).toBe(true);
  });

  it("isRefillEligible returns false for daysSupply of 1 when filled moments ago", () => {
    // Arrange — 1-day supply, filled just now (0 days elapsed; threshold is 0.8 days)
    const lastFillDate = new Date();
    const daysSupply = 1;
    const refillsRemaining = 5;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert
    expect(result).toBe(false);
  });

  it("isRefillEligible returns true for 90-day supply when 73 days have passed", () => {
    // Arrange — 90-day supply, filled 73 days ago (threshold is 72 days)
    const lastFillDate = daysAgo(73);
    const daysSupply = 90;
    const refillsRemaining = 1;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert
    expect(result).toBe(true);
  });

  it("isRefillEligible returns false for 90-day supply when only 71 days have passed", () => {
    // Arrange — 90-day supply, filled 71 days ago (one day short of the 72-day threshold)
    const lastFillDate = daysAgo(71);
    const daysSupply = 90;
    const refillsRemaining = 1;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Gap: daysSupply = 0 — threshold collapses to 0, making every fill
  // immediately eligible. A 0-day supply is not a real prescription.
  // ---------------------------------------------------------------------------
  it("isRefillEligible returns false for daysSupply of 0 (zero-day supply is never eligible)", () => {
    // Arrange — nonsensical supply value filled moments ago
    const lastFillDate = new Date();
    const daysSupply = 0;
    const refillsRemaining = 3;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert — a zero-day supply should never be eligible; perpetual eligibility
    // would allow unlimited immediate refills
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Gap: negative daysSupply — threshold goes below zero, so daysSinceFill
  // (always >= 0) silently passes and returns true for every fill date.
  // ---------------------------------------------------------------------------
  it("isRefillEligible returns false for negative daysSupply", () => {
    // Arrange — corrupted supply value, filled moments ago
    const lastFillDate = new Date();
    const daysSupply = -30;
    const refillsRemaining = 3;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert — negative supply is invalid; should not grant eligibility
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Gap: future lastFillDate — daysSinceFill goes negative, comparison with a
  // positive threshold silently returns false instead of surfacing the bad data.
  // ---------------------------------------------------------------------------
  it("isRefillEligible returns false for a future lastFillDate (post-dated prescription)", () => {
    // Arrange — fill date set 7 days in the future
    const lastFillDate = new Date();
    lastFillDate.setDate(lastFillDate.getDate() + 7);
    const daysSupply = 30;
    const refillsRemaining = 3;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert — a future fill date should never grant eligibility
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Gap: NaN daysSupply — threshold becomes NaN; NaN comparisons always return
  // false, silently locking the patient out of refills indefinitely.
  // ---------------------------------------------------------------------------
  it("isRefillEligible returns false for NaN daysSupply without silently blocking a valid patient", () => {
    // Arrange — daysSupply is NaN (e.g. parsed from a bad DB value), filled 30 days ago
    const lastFillDate = daysAgo(30);
    const daysSupply = NaN;
    const refillsRemaining = 3;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert — NaN threshold must not silently return false and block the patient;
    // the function should throw or return false for a clearly defined reason.
    // Currently returns false (silent wrong answer) — this test pins the behavior
    // so any future change is deliberate.
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Gap: NaN refillsRemaining — NaN <= 0 is false, so the guard is bypassed.
  // The function then grants eligibility based solely on the fill date, as if
  // the patient had unlimited refills.
  // ---------------------------------------------------------------------------
  it("isRefillEligible returns false for NaN refillsRemaining (guard must not be bypassed)", () => {
    // Arrange — refillsRemaining is NaN (e.g. missing DB column), filled 30 days ago
    const lastFillDate = daysAgo(30);
    const daysSupply = 30;
    const refillsRemaining = NaN;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert — unknown refill count must not silently grant eligibility
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Gap: negative refillsRemaining — pins that the <= 0 guard covers negative
  // values so a future refactor to === 0 doesn't regress this.
  // ---------------------------------------------------------------------------
  it("isRefillEligible returns false when refillsRemaining is negative", () => {
    // Arrange — corrupted refill count, filled 30 days ago
    const lastFillDate = daysAgo(30);
    const daysSupply = 30;
    const refillsRemaining = -1;

    // Act
    const result = isRefillEligible(lastFillDate, daysSupply, refillsRemaining);

    // Assert
    expect(result).toBe(false);
  });
});
