// Broken test — help me fix it
import { test, expect } from "@playwright/test";

test("patient can view prescriptions", async ({ page }) => {
  await page.goto("localhost:3000/prescriptions");
  await page.fill("#email", "patient1@helix.test");
  await page.fill("#password", "TestPass123!");
  await page.click("button[type=submit]");
  await expect(page.locator(".prescription-item")).toBeVisible();
});
