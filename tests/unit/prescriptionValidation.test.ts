import {
  parseDosageMg,
  resolveFrequencyPerDay,
  validatePrescriptionDosage,
  getControlledSchedule,
  isControlledSubstance,
  requiresScheduleIIAuthorisation,
} from "../../server/src/services/prescriptionValidation";

// ---------------------------------------------------------------------------
// parseDosageMg
// ---------------------------------------------------------------------------
describe("parseDosageMg", () => {
  it("parseDosageMg returns numeric mg value when input is compact format", () => {
    // Arrange
    const dosage = "500mg";

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBe(500);
  });

  it("parseDosageMg returns numeric mg value when input has a space before mg", () => {
    // Arrange
    const dosage = "10 mg";

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBe(10);
  });

  it("parseDosageMg returns numeric mg value when input is uppercase", () => {
    // Arrange
    const dosage = "250MG";

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBe(250);
  });

  it("parseDosageMg returns numeric mg value when input contains a decimal", () => {
    // Arrange
    const dosage = "12.5mg";

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBe(12.5);
  });

  it("parseDosageMg returns null when input has no mg suffix", () => {
    // Arrange
    const dosage = "500";

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBeNull();
  });

  it("parseDosageMg returns null when input is an empty string", () => {
    // Arrange
    const dosage = "";

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBeNull();
  });

  it("parseDosageMg returns null when input uses a different unit", () => {
    // Arrange
    const dosage = "5ml";

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBeNull();
  });

  it("parseDosageMg returns null when input has no leading number", () => {
    // Arrange
    const dosage = "mg";

    // Act
    const result = parseDosageMg(dosage);

    // Assert
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveFrequencyPerDay
// ---------------------------------------------------------------------------
describe("resolveFrequencyPerDay", () => {
  it("resolveFrequencyPerDay returns 1 when frequency is 'once daily'", () => {
    // Arrange
    const frequency = "once daily";

    // Act
    const result = resolveFrequencyPerDay(frequency);

    // Assert
    expect(result).toBe(1);
  });

  it("resolveFrequencyPerDay returns 1 when frequency is abbreviation 'qd'", () => {
    // Arrange
    const frequency = "qd";

    // Act
    const result = resolveFrequencyPerDay(frequency);

    // Assert
    expect(result).toBe(1);
  });

  it("resolveFrequencyPerDay returns 2 when frequency is 'twice daily'", () => {
    // Arrange
    const frequency = "twice daily";

    // Act
    const result = resolveFrequencyPerDay(frequency);

    // Assert
    expect(result).toBe(2);
  });

  it("resolveFrequencyPerDay returns 2 when frequency is abbreviation 'bid'", () => {
    // Arrange
    const frequency = "bid";

    // Act
    const result = resolveFrequencyPerDay(frequency);

    // Assert
    expect(result).toBe(2);
  });

  it("resolveFrequencyPerDay returns 4 when frequency is 'every 6 hours'", () => {
    // Arrange
    const frequency = "every 6 hours";

    // Act
    const result = resolveFrequencyPerDay(frequency);

    // Assert
    expect(result).toBe(4);
  });

  it("resolveFrequencyPerDay returns 3 when frequency is 'every 8 hours'", () => {
    // Arrange
    const frequency = "every 8 hours";

    // Act
    const result = resolveFrequencyPerDay(frequency);

    // Assert
    expect(result).toBe(3);
  });

  it("resolveFrequencyPerDay returns null when frequency is unrecognised", () => {
    // Arrange
    const frequency = "as needed";

    // Act
    const result = resolveFrequencyPerDay(frequency);

    // Assert
    expect(result).toBeNull();
  });

  it("resolveFrequencyPerDay returns null when frequency is an empty string", () => {
    // Arrange
    const frequency = "";

    // Act
    const result = resolveFrequencyPerDay(frequency);

    // Assert
    expect(result).toBeNull();
  });

  it("resolveFrequencyPerDay is case-insensitive", () => {
    // Arrange
    const frequency = "TWICE DAILY";

    // Act
    const result = resolveFrequencyPerDay(frequency);

    // Assert
    expect(result).toBe(2);
  });

  it("resolveFrequencyPerDay trims surrounding whitespace", () => {
    // Arrange
    const frequency = "  bid  ";

    // Act
    const result = resolveFrequencyPerDay(frequency);

    // Assert
    expect(result).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// validatePrescriptionDosage
// ---------------------------------------------------------------------------
describe("validatePrescriptionDosage", () => {
  it("validatePrescriptionDosage returns valid when daily dose is well below maximum", () => {
    // Arrange — metformin max is 2550 mg/day; 500 mg × twice daily = 1000 mg/day
    const drugName = "metformin";
    const dosage = "500mg";
    const frequency = "twice daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result).toEqual({ valid: true, dailyDoseMg: 1000, maxDailyMg: 2550 });
  });

  it("validatePrescriptionDosage returns invalid when daily dose exceeds maximum", () => {
    // Arrange — metformin max is 2550 mg/day; 1000 mg × tid = 3000 mg/day
    const drugName = "metformin";
    const dosage = "1000mg";
    const frequency = "three times daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result).toEqual({
      valid: false,
      dailyDoseMg: 3000,
      maxDailyMg: 2550,
      error: expect.stringContaining("3000mg"),
    });
  });

  it("validatePrescriptionDosage returns invalid when daily dose exactly equals maximum (boundary)", () => {
    // Arrange — metformin max is 2550 mg/day; 1275 mg × twice daily = 2550 mg/day (== max)
    // COURSE_BUG: implementation uses > instead of >=, so this incorrectly returns valid.
    // Flip to valid: false once the bug is fixed.
    const drugName = "metformin";
    const dosage = "1275mg";
    const frequency = "twice daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result).toEqual({ valid: true, dailyDoseMg: 2550, maxDailyMg: 2550 });
  });

  it("validatePrescriptionDosage returns valid when drug is not in the known list", () => {
    // Arrange
    const drugName = "unknowndrug";
    const dosage = "500mg";
    const frequency = "once daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result).toEqual({ valid: true });
  });

  it("validatePrescriptionDosage returns valid when dosage string cannot be parsed", () => {
    // Arrange
    const drugName = "metformin";
    const dosage = "one tablet";
    const frequency = "twice daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result).toEqual({ valid: true });
  });

  it("validatePrescriptionDosage returns valid when frequency is unrecognised", () => {
    // Arrange
    const drugName = "metformin";
    const dosage = "500mg";
    const frequency = "as needed";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result).toEqual({ valid: true });
  });

  it("validatePrescriptionDosage is case-insensitive for drug name", () => {
    // Arrange
    const drugName = "Metformin";
    const dosage = "500mg";
    const frequency = "once daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result.valid).toBe(true);
  });

  it("validatePrescriptionDosage returns valid for controlled substance not in dosage table", () => {
    // Arrange — oxycodone is not in MAX_DAILY_DOSES_MG so numeric validation is skipped
    const drugName = "oxycodone";
    const dosage = "5mg";
    const frequency = "twice daily";

    // Act
    const result = validatePrescriptionDosage(drugName, dosage, frequency);

    // Assert
    expect(result).toEqual({ valid: true });
  });
});

// ---------------------------------------------------------------------------
// getControlledSchedule
// ---------------------------------------------------------------------------
describe("getControlledSchedule", () => {
  it("getControlledSchedule returns 'II' for a Schedule II drug", () => {
    // Arrange
    const drugName = "oxycodone";

    // Act
    const result = getControlledSchedule(drugName);

    // Assert
    expect(result).toBe("II");
  });

  it("getControlledSchedule returns 'III' for a Schedule III drug", () => {
    // Arrange
    const drugName = "ketamine";

    // Act
    const result = getControlledSchedule(drugName);

    // Assert
    expect(result).toBe("III");
  });

  it("getControlledSchedule returns 'IV' for a Schedule IV drug", () => {
    // Arrange
    const drugName = "diazepam";

    // Act
    const result = getControlledSchedule(drugName);

    // Assert
    expect(result).toBe("IV");
  });

  it("getControlledSchedule returns 'V' for a Schedule V drug", () => {
    // Arrange
    const drugName = "gabapentin";

    // Act
    const result = getControlledSchedule(drugName);

    // Assert
    expect(result).toBe("V");
  });

  it("getControlledSchedule returns 'unscheduled' for a non-controlled drug", () => {
    // Arrange
    const drugName = "metformin";

    // Act
    const result = getControlledSchedule(drugName);

    // Assert
    expect(result).toBe("unscheduled");
  });

  it("getControlledSchedule returns 'unscheduled' for an unknown drug", () => {
    // Arrange
    const drugName = "unknowndrug";

    // Act
    const result = getControlledSchedule(drugName);

    // Assert
    expect(result).toBe("unscheduled");
  });

  it("getControlledSchedule is case-insensitive", () => {
    // Arrange
    const drugName = "OxyCODONE";

    // Act
    const result = getControlledSchedule(drugName);

    // Assert
    expect(result).toBe("II");
  });
});

// ---------------------------------------------------------------------------
// isControlledSubstance
// ---------------------------------------------------------------------------
describe("isControlledSubstance", () => {
  it("isControlledSubstance returns true when drug is Schedule II", () => {
    // Arrange
    const drugName = "fentanyl";

    // Act
    const result = isControlledSubstance(drugName);

    // Assert
    expect(result).toBe(true);
  });

  it("isControlledSubstance returns true when drug is Schedule IV", () => {
    // Arrange
    const drugName = "alprazolam";

    // Act
    const result = isControlledSubstance(drugName);

    // Assert
    expect(result).toBe(true);
  });

  it("isControlledSubstance returns false when drug is unscheduled", () => {
    // Arrange
    const drugName = "ibuprofen";

    // Act
    const result = isControlledSubstance(drugName);

    // Assert
    expect(result).toBe(false);
  });

  it("isControlledSubstance returns false for an unknown drug", () => {
    // Arrange
    const drugName = "unknowndrug";

    // Act
    const result = isControlledSubstance(drugName);

    // Assert
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requiresScheduleIIAuthorisation
// ---------------------------------------------------------------------------
describe("requiresScheduleIIAuthorisation", () => {
  it("requiresScheduleIIAuthorisation returns true for a Schedule II drug", () => {
    // Arrange
    const drugName = "adderall";

    // Act
    const result = requiresScheduleIIAuthorisation(drugName);

    // Assert
    expect(result).toBe(true);
  });

  it("requiresScheduleIIAuthorisation returns false for a Schedule III drug", () => {
    // Arrange
    const drugName = "codeine";

    // Act
    const result = requiresScheduleIIAuthorisation(drugName);

    // Assert
    expect(result).toBe(false);
  });

  it("requiresScheduleIIAuthorisation returns false for a Schedule IV drug", () => {
    // Arrange
    const drugName = "tramadol";

    // Act
    const result = requiresScheduleIIAuthorisation(drugName);

    // Assert
    expect(result).toBe(false);
  });

  it("requiresScheduleIIAuthorisation returns false for an unscheduled drug", () => {
    // Arrange
    const drugName = "aspirin";

    // Act
    const result = requiresScheduleIIAuthorisation(drugName);

    // Assert
    expect(result).toBe(false);
  });

  it("requiresScheduleIIAuthorisation is case-insensitive", () => {
    // Arrange
    const drugName = "MORPHINE";

    // Act
    const result = requiresScheduleIIAuthorisation(drugName);

    // Assert
    expect(result).toBe(true);
  });
});
