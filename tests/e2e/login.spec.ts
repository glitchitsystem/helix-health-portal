import { test, expect } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";

test.describe("Login screen", () => {
  test("patient logs in successfully", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAndWait(
      "patient1@helixhealthportal.test",
      "TestPass123!",
    );
    await expect(page).toHaveURL("/dashboard");
  });

  test("wrong password shows error", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login("patient1@helixhealthportal.test", "WrongPassword!");
    await expect(loginPage.errorMessage).toBeVisible();
  });
});
