import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Login page has no critical accessibility violations", async ({
  page,
}) => {
  await page.goto("/login");

  const results = await new AxeBuilder({ page }).analyze();

  // Assert zero critical and serious violations
  const critical = results.violations.filter((v) => v.impact === "critical");
  const serious = results.violations.filter((v) => v.impact === "serious");

  expect(critical, formatViolations(critical)).toHaveLength(0);
  expect(serious, formatViolations(serious)).toHaveLength(0);
});

// Helper: formats violations for readable failure messages
function formatViolations(
  violations: typeof AxeBuilder.prototype.analyze extends () => Promise<infer R>
    ? R["violations"]
    : never,
): string {
  if (!violations.length) return "";
  return violations
    .map(
      (v) =>
        `[${v.impact?.toUpperCase()}] ${v.id}: ${v.description}\n` +
        v.nodes.map((n) => `  → ${n.target.join(" ")}`).join("\n"),
    )
    .join("\n\n");
}

test("Appointment Booking form is accessible", async ({ page }) => {
  await page.goto("/appointments/new");

  const results = await new AxeBuilder({ page })
    .include("#appointment-form") // Scan only this element and its children
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(blocking, formatViolations(blocking)).toHaveLength(0);
});

test("Navigation menu is accessible", async ({ page }) => {
  await page.goto("/dashboard");

  const results = await new AxeBuilder({ page })
    .include('nav[aria-label="Main navigation"]')
    .exclude(".beta-feature-flag") // Exclude known work-in-progress
    .analyze();

  expect(
    results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
    formatViolations(results.violations),
  ).toHaveLength(0);
});
