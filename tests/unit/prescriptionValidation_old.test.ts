import {
  parseDosageMg,
  resolveFrequencyPerDay,
  validatePrescriptionDosage,
} from "../../server/src/services/prescriptionValidation";

// parseDosageMg

describe("parseDosageMg", () => {
  test("returns numeric value for a simple mg string", () => {
    // Arrange
    const dosage = "500mg";

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBe(500);
  });

  test("handles a space between number and unit", () => {
    // Arrange
    const dosage = "10 mg";

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBe(10);
  });

  test("returns null when input contains no mg unit", () => {
    // Arrange
    const dosage = "500"; // no unit

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBeNull();
  });

  test("returns null for an empty string", () => {
    // Arrange
    const dosage = "";

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBeNull();
  });
});
// resolveFrequencyPerDay

describe("resolveFrequencyPerDay", () => {
  test('maps "once daily" to 1 dose per day', () => {
    // Arrange
    const dosage = "once daily";

    // Act
    const result = resolveFrequencyPerDay(dosage);

    // Assert
    expect(result).toBe(1);
  });

  test('maps abbreviation "bid" to 2 doses per day', () => {
    // Arrange
    const dosage = "bid";

    // Act
    const result = resolveFrequencyPerDay(dosage);

    // Assert
    expect(result).toBe(2);
  });

  test('maps "three times daily" to 3 doses per day', () => {
    // Arrange
    const dosage = "three times daily";

    // Act
    const result = resolveFrequencyPerDay(dosage);

    // Assert
    expect(result).toBe(3);
  });

  test("returns null for an unrecognised frequency string", () => {
    // Arrange
    const dosage = "whenever I feel like it";

    // Act
    const result = resolveFrequencyPerDay(dosage);

    // Assert
    expect(result).toBeNull();
  });

  test("is case-insensitive", () => {
    // Arrange
    const dosage = "TWICE DAILY";

    // Act
    const result = resolveFrequencyPerDay(dosage);

    // Assert
    expect(result).toBe(2);
  });
});
// validatePrescriptionDosage

describe("validatePrescriptionDosage", () => {
  test("returns valid:true for metformin within maximum dose", () => {
    // Arrange — 1000mg × 2 = 2000mg/day; max is 2550mg
    const drugName = "metformin";
    const dosage = "1000mg";
    const frequency = "twice daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result.valid).toBe(true);
  });

  test("returns valid:false for metformin exceeding maximum dose", () => {
    // Arrange — 1500mg × 2 = 3000mg/day; max is 2550mg
    const drugName = "metformin";
    const dosage = "1500mg";
    const frequency = "twice daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.dailyDoseMg).toBe(3000);
    expect(result.maxDailyMg).toBe(2550);
  });

  test("returns valid:true for an unknown drug (not in our list)", () => {
    // Arrange — drug not in MAX_DAILY_DOSES_MG — validation skipped
    const drugName = "some-experimental-drug";
    const dosage = "9999mg";
    const frequency = "four times daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result.valid).toBe(true);
  });

  test("returns valid:true when dosage string cannot be parsed", () => {
    // Arrange — unparseable dosage format — validation skipped
    const drugName = "metformin";
    const dosage = "a lot"; // not a parseable mg string
    const frequency = "twice daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result.valid).toBe(true);
  });

  test("returns valid:false for warfarin exceeding maximum dose", () => {
    // Arrange — 10mg × 2 = 20mg/day; max is 15mg
    const drugName = "warfarin";
    const dosage = "10mg";
    const frequency = "twice daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.dailyDoseMg).toBe(20);
  });

  test("returns valid:false when daily dose equals the maximum (boundary)", () => {
    // Arrange — 1275mg × 2 = 2550mg/day exactly at the metformin limit
    const drugName = "metformin";
    const dosage = "1275mg";
    const frequency = "twice daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert — a dose AT the maximum should NOT be valid
    expect(result.valid).toBe(false);
  });
});
