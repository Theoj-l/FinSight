import { expect, test } from "@playwright/test";

test.describe("route protection", () => {
  for (const route of ["home", "dashboard", "assistant", "insights", "reports", "settings"]) {
    test(`signed-out requests to /${route} redirect before rendering the application`, async ({ page }) => {
      await page.goto(`/${route}`);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=(%2F|/)${route}$`));
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    });
  }

  test("sign-in is the default with optional account creation", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.getByRole("link", { name: "Sign up to create an account" }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("minlength", "8");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("example-password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("example-password");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("sign-in form", () => {
  test("supports labels, keyboard navigation, password visibility and native validation", async ({ page, browserName }) => {
    await page.goto("/login");
    const email = page.getByLabel("Email Address", { exact: true });
    const password = page.getByLabel("Password", { exact: true });
    await email.focus();
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await password.fill("example-password");
    // Safari on macOS uses Option-Tab to include buttons in keyboard navigation.
    await page.keyboard.press(browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    await expect(page.getByRole("button", { name: "Show password" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(email).toBeFocused();
    expect(await email.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  });

  test("Enter submits, pending blocks repeat submission, and errors are accessible", async ({ page }) => {
    // Exercise the real server action's validation without sending credentials to Supabase.
    await page.goto("/login");
    await page.locator("form").evaluate((form: HTMLFormElement) => { form.noValidate = true; });
    await page.route("**/login", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      await route.continue();
    });
    await page.getByLabel("Password", { exact: true }).press("Enter");
    await expect(page.getByRole("button", { name: "Signing in…", exact: true })).toBeDisabled();
    await expect(page.locator("#auth-error")).toHaveText("Check the highlighted fields and try again.");
    await expect(page.locator("#auth-error")).toBeFocused();
    await expect(page.getByLabel("Email Address", { exact: true })).toHaveAttribute("aria-describedby", "email-error");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-describedby", "password-error");
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
  });

  test("fits a narrow mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
