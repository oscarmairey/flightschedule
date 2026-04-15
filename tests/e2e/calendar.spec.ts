import { test, expect, loginAs, resetDb } from "./fixtures";

function addDays(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

async function bookWindow(
  page: import("@playwright/test").Page,
  input: { date: string; startHour: string; endHour: string },
): Promise<void> {
  await page.goto("/calendar");
  await page.fill('input[name="startDate"]', input.date);
  await page.fill('input[name="endDate"]', input.date);
  // TimeBlockPicker is a radiogroup of "HHh" buttons. Select by aria-label
  // on the wrapper + button text.
  await page
    .getByRole("radiogroup", { name: "Heure de début" })
    .getByRole("radio", { name: input.startHour })
    .click();
  await page
    .getByRole("radiogroup", { name: "Heure de fin" })
    .getByRole("radio", { name: input.endHour })
    .click();
  await page.getByRole("button", { name: /^Réserver$/ }).click();
}

test.describe("Calendar — full booking + cancel journey", () => {
  test.beforeEach(() => resetDb());

  test("pilot books a 3h slot and sees it in the upcoming list", async ({
    page,
  }) => {
    await loginAs(page, "pilot1");
    const date = addDays(3); // 3 days out → cancellation allowed
    await bookWindow(page, { date, startHour: "09h", endHour: "12h" });

    await page.waitForURL(/\/calendar.*booked=1/, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText("Réservation confirmée");
    await expect(page.locator("body")).toContainText("Mes réservations à venir");
    await expect(page.locator("body")).toContainText("09:00 – 12:00");
    await expect(page.locator("body")).toContainText("3h00");
  });

  test("overlap with an existing reservation is rejected", async ({ page }) => {
    await loginAs(page, "pilot1");
    const date = addDays(3);
    await bookWindow(page, { date, startHour: "09h", endHour: "12h" });
    await page.waitForURL(/booked=1/);

    // Try the same window again — hits rule #3 overlap.
    await bookWindow(page, { date, startHour: "09h", endHour: "12h" });
    await page.waitForURL(/error=overlap/, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/chevauche/i);
  });

  test("adjacent window on the same day (half-open intervals) succeeds", async ({
    page,
  }) => {
    await loginAs(page, "pilot1");
    const date = addDays(3);
    await bookWindow(page, { date, startHour: "09h", endHour: "12h" });
    await page.waitForURL(/booked=1/);
    await bookWindow(page, { date, startHour: "12h", endHour: "15h" });
    await page.waitForURL(/booked=1/);
    await expect(page.locator("body")).toContainText("09:00 – 12:00");
    await expect(page.locator("body")).toContainText("12:00 – 15:00");
  });

  test("pilot cancels a reservation booked >24 h out", async ({ page }) => {
    await loginAs(page, "pilot1");
    const date = addDays(3);
    await bookWindow(page, { date, startHour: "09h", endHour: "12h" });
    await page.waitForURL(/booked=1/);

    // Click the outer "Annuler" ghost button to open the confirm dialog
    // (scoped to the upcoming-reservations list so we don't match other
    // "Annuler" buttons that may live in the shell).
    const list = page.getByRole("list").first();
    await list.getByRole("button", { name: /^Annuler$/ }).click();
    await page
      .getByRole("button", { name: /Confirmer l'annulation/ })
      .click();

    await page.waitForURL(/cancelled=1/, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText("Réservation annulée");
    await expect(page.locator("body")).not.toContainText("Mes réservations à venir");
  });

  test("calendar page renders week navigation + the form for any logged-in pilot", async ({
    page,
  }) => {
    await loginAs(page, "pilot1");
    await page.goto("/calendar");
    await expect(
      page.getByRole("button", { name: /Semaine précédente/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Aujourd'hui/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Semaine suivante/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Réserver$/ }),
    ).toBeVisible();
  });
});
