import { test, expect, loginAs, resetDb } from "./fixtures";

test.describe("Admin — pilot management journey", () => {
  test.beforeEach(() => resetDb());

  test("admin sees seeded pilots in the list", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/pilots");
    await expect(page.locator("body")).toContainText("Pilot One");
    await expect(page.locator("body")).toContainText("Pilot Two");
  });

  test("admin creates a new pilot and sees them in the list", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/pilots/new");
    const email = `newpilot-${Date.now()}@test.local`;
    await page.fill('input[name="name"]', "New Pilot");
    await page.fill('input[name="email"]', email);
    await Promise.all([
      page.waitForURL(/\/admin\/pilots\/[0-9a-f-]{36}\?welcome=1/, {
        timeout: 15_000,
      }),
      page.getByRole("button", { name: /Créer le compte/ }).click(),
    ]);

    await page.goto("/admin/pilots");
    await expect(page.locator("body")).toContainText("New Pilot");
    await expect(page.locator("body")).toContainText(email);
  });

  test("duplicate email is rejected", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/pilots/new");
    await page.fill('input[name="name"]', "Dup Pilot");
    await page.fill('input[name="email"]', "pilot1@test.local");
    await Promise.all([
      page.waitForURL(/\/admin\/pilots\/new\?error=duplicate/, {
        timeout: 15_000,
      }),
      page.getByRole("button", { name: /Créer le compte/ }).click(),
    ]);
  });

  test("admin adjusts a pilot's HDV through the ADMIN_ADJUSTMENT flow", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    const pilotId = "00000000-0000-4000-a000-000000000002";
    await page.goto(`/admin/pilots/${pilotId}`);

    // Scope to the HDV adjust card — fields have stable ids (#sign,
    // #amount, #reason) that disambiguate from the nearby email /
    // password / deactivate forms.
    await page.selectOption("#sign", "credit");
    await page.fill("#amount", "2h00");
    await page.fill("#reason", "Correction paper logbook Mar 2026");
    await Promise.all([
      page.waitForURL(new RegExp(`/admin/pilots/${pilotId}\\?adjusted=1`), {
        timeout: 15_000,
      }),
      page.getByRole("button", { name: /Appliquer l'ajustement/ }).click(),
    ]);

    await expect(page.locator("body")).toContainText(
      "Correction paper logbook",
    );
    // Pilot1 seeded with 600 min. Our seed-fixtures.ts also added a
    // 90-min flight (and a balancing +90 credit), net zero from seed,
    // balance stays at 600. After a +120-min admin credit: 720 = 12h00.
    await expect(page.locator("body")).toContainText("12h00");
  });

  test("admin deactivates a pilot — pilot can no longer sign in", async ({
    page,
    browser,
  }) => {
    await loginAs(page, "admin");
    const pilotId = "00000000-0000-4000-a000-000000000002";
    await page.goto(`/admin/pilots/${pilotId}`);

    // ConfirmButton: click the trigger (exact match so we don't catch
    // "Réactiver"), then the modal's confirm (also exact so we don't
    // catch the trigger again).
    await page
      .getByRole("button", { name: "Désactiver le compte", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Désactiver", exact: true })
      .click();
    await page.waitForURL(/toggled=1/, { timeout: 15_000 });

    // Fresh context — deactivated pilot can't sign in.
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/login");
    await p.fill('input[name="email"]', "pilot1@test.local");
    await p.fill('input[name="password"]', "Pilot-Test-1234");
    await p.click('button[type="submit"]');
    await p.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(p).toHaveURL(/\/login/);
    await ctx.close();
  });
});
