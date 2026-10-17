import { test, expect } from "@playwright/test";

test("extension-injected body attributes do not warn during hydration", async ({ page }) => {
  const hydrationErrors: string[] = [];
  const recordHydrationError = (message: string) => {
    if (/hydration|hydrated/i.test(message)) hydrationErrors.push(message);
  };
  page.on("console", (message) => {
    if (message.type() === "error") recordHydrationError(message.text());
  });
  page.on("pageerror", (error) => recordHydrationError(error.message));
  await page.addInitScript(() => {
    // Extensions can mutate the body as the document is parsed, before React hydrates.
    const injectAttributes = () => {
      if (!document.body) return false;
      document.body.setAttribute("monica-id", "extension-test");
      document.body.setAttribute("monica-version", "9.0.23");
      return true;
    };
    if (!injectAttributes()) {
      const observer = new MutationObserver(() => {
        if (injectAttributes()) observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  });

  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("monica-id", "extension-test");
  await expect(page.locator("body")).toHaveAttribute("monica-version", "9.0.23");
  await expect(page.getByRole("heading", { name: "Good ideas start here." })).toBeVisible();
  await page.locator("main").getByRole("link", { name: "New project", exact: true }).click();
  await page.getByRole("button", { name: "Fill example brief" }).click();
  await expect(page.getByLabel("Brand Name", { exact: false })).toHaveValue("Morning Brew");
  expect(hydrationErrors).toEqual([]);
});
