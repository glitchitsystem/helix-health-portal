import { test, expect } from "@playwright/test";

test("test", async ({ page }) => {
  await page.goto("http://localhost:5173/login");
  await expect(
    page.getByRole("heading", { name: "Helix Health Portal" }),
  ).toBeVisible();

  await page.getByRole("textbox", { name: "Email address" }).click();
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill("patient1@helixhealthportal.test");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("TestPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto("http://localhost:5173/appointments/book");
  await expect(
    page.getByRole("navigation", { name: "Booking progress" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Follow-up 30 minutes" }).click();
  await page.getByRole("button", { name: "cardiologist@" }).click();
  await expect(
    page.getByRole("group", { name: "Available Times" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "03:00 AM" }).click();
  await expect(page.getByText("Appointment SummaryTypeFollow")).toBeVisible();
  await page.getByRole("button", { name: "Confirm Appointment" }).click();
});
