import { test, expect } from "@playwright/test";
import { scanPage, formatViolations } from "./shared/a11y.helpers";

test.describe("Accessibility @a11y", () => {
  test("Login page has no critical axe-core violations", async ({ page }) => {
    await page.goto("/");

    const { critical, violations } = await scanPage(page);

    // Print all violations in the failure message for easy diagnosis
    expect(critical, formatViolations(violations)).toHaveLength(0);
  });

  test("Login page has no serious axe-core violations", async ({ page }) => {
    await page.goto("/");

    const { serious, violations } = await scanPage(page);

    expect(serious, formatViolations(violations)).toHaveLength(0);
  });

  test("Login form fields are all labelled", async ({ page }) => {
    await page.goto("/");

    // Scope the scan to the login form only
    const { violations } = await scanPage(page, "form");

    const labelViolations = violations.filter((v) => v.id === "label");
    expect(labelViolations, formatViolations(labelViolations)).toHaveLength(0);
  });
});
