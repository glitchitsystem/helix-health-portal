import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { playwrightLogin } from "../fixtures/api.helpers";
import { AppointmentBookingPage } from "./pages/AppointmentBookingPage";

test.describe("Appointment booking — patient happy path", () => {
  test.beforeEach(async ({ page }) => {
    await playwrightLogin(page, "patient1");
  });

  test("patient completes the booking wizard and arrives at /appointments", async ({
    page,
  }) => {
    const bookingPage = new AppointmentBookingPage(page);

    const today = new Date();
    today.setDate(today.getDate() + 7);
    const dateString = today.toISOString().slice(0, 10);

    await bookingPage.goto();
    await bookingPage.selectAppointmentType("Follow-up");
    await page.locator("button[aria-pressed]").first().click();
    await bookingPage.setDate(dateString);
    await bookingPage.selectTimeSlot("09:00");
    await bookingPage.addNotes("Lab 6.1 test notes");
    await bookingPage.confirm();

    await expect(page).toHaveURL(/\/appointments/);
    await expect(page.getByText(/appointment booked/i)).toBeVisible();
  });
});

test.describe("Appointment booking — back-navigation edge cases", () => {
  test.beforeEach(async ({ page }) => {
    await playwrightLogin(page, "patient1");
  });

  // COURSE_BUG: setSlot(null) is missing in handleSelectType
  test("COURSE_BUG: changing appointment type after back-navigation clears the previous slot", async ({
    page,
  }) => {
    const bookingPage = new AppointmentBookingPage(page);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const dateString = futureDate.toISOString().slice(0, 10);

    await bookingPage.goto();

    // Step 1: select "Follow-up"
    await bookingPage.selectAppointmentType("Follow-up");

    // Step 2: pick first provider, a date, then the first available slot
    const availableSlot = page
      .getByRole("group", { name: "Available Times" })
      .locator("button:not([disabled])");

    await page.locator("button[aria-pressed]").first().click();
    await bookingPage.setDate(dateString);
    await availableSlot.first().waitFor();
    const firstSlotLabel = await availableSlot.first().textContent();
    await availableSlot.first().click();

    // Go back to step 1
    await bookingPage.goBack();
    await bookingPage.goBack();
    await expect(bookingPage.stepChooseType).toBeVisible();

    // Step 1 again: select a different appointment type
    await bookingPage.selectAppointmentType("Annual Physical");

    // Step 2 again: same provider, same date, then the second available slot
    await page.locator("button[aria-pressed]").first().click();
    await bookingPage.setDate(dateString);
    await availableSlot.nth(1).waitFor();
    const secondSlotLabel = await availableSlot.nth(1).textContent();
    await availableSlot.nth(1).click();

    // Step 3: confirm page should reflect the NEW selections
    await expect(bookingPage.summaryHeading).toBeVisible();

    // The second slot must appear in the summary
    await expect(page.getByText(secondSlotLabel!.trim())).toBeVisible();

    // The first (stale) slot must NOT appear — if it does, the bug is present
    await expect(page.getByText(firstSlotLabel!.trim())).not.toBeVisible();
  });
});

test.describe("Appointment booking — API error handling", () => {
  test.beforeEach(async ({ page }) => {
    await playwrightLogin(page, "patient1");
  });

  test("shows an error message when the API returns a conflict", async ({
    page,
  }) => {
    const booking = new AppointmentBookingPage(page);

    await page.route("**/api/appointments", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 409,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "This time slot is no longer available.",
          }),
        });
      } else {
        route.continue();
      }
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const dateString = futureDate.toISOString().slice(0, 10);

    await booking.goto();
    await booking.selectAppointmentType("Follow-up");

    // Step 2: pick the first provider (whatever appears first in the list)
    await page.locator("button[aria-pressed]").first().click();
    await booking.setDate(dateString);

    // Select a slot already marked unavailable (disabled by the UI)
    const unavailableSlot = page
      .locator('button[aria-disabled="true"]')
      .first();
    await unavailableSlot.click({ force: true });

    await booking.confirmButton.click();

    await expect(booking.bookingError).toBeVisible();
    await expect(booking.bookingError).toHaveText(
      /no longer available|conflict/i,
    );
    await expect(page).toHaveURL(/\/appointments\/book/);
  });
});

test.describe("Appointment booking — accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await playwrightLogin(page, "patient1");
  });

  test("step 1 (Choose Type) has no critical WCAG 2.1 AA violations", async ({
    page,
  }) => {
    await page.goto("/appointments/book");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("step 3 (Confirm) has no critical WCAG 2.1 AA violations", async ({
    page,
  }) => {
    const booking = new AppointmentBookingPage(page);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14);
    const dateString = futureDate.toISOString().slice(0, 10);

    await booking.goto();
    await booking.selectAppointmentType("Follow-up");
    await page.locator("button[aria-pressed]").first().click();
    await booking.setDate(dateString);
    await page
      .getByRole("group", { name: "Available Times" })
      .locator("button:not([disabled])")
      .first()
      .click();
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("error state after a 409 response has no critical WCAG 2.1 AA violations", async ({
    page,
  }) => {
    const booking = new AppointmentBookingPage(page);

    await page.route("**/api/appointments", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 409,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "This time slot is no longer available.",
          }),
        });
      } else {
        route.continue();
      }
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 21);
    const dateString = futureDate.toISOString().slice(0, 10);

    await booking.goto();
    await booking.selectAppointmentType("Follow-up");
    await page.locator("button[aria-pressed]").first().click();
    await booking.setDate(dateString);
    await page
      .getByRole("group", { name: "Available Times" })
      .locator("button:not([disabled])")
      .first()
      .click();
    await booking.confirmButton.click();
    await expect(booking.bookingError).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
