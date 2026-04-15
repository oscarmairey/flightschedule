// FlightSchedule — helper for search-param-driven banners.
//
// Before Pass 3.1, every page that reads `searchParams` to display a
// one-shot "result of the last server action" banner had a nested
// ternary chain of 5–15 branches (calendar, admin/disponibilites,
// admin/tarifs, admin/pilots/[id], …). Those chains are write-once,
// debug-never — hard to scan, hard to add a new case to, and every
// page has to reinvent the same shape.
//
// This helper turns the pattern into a flat map. Keys describe the
// trigger:
//
//   "flagName"       → fires when sp.flagName === "1"
//   "error:name"     → fires when sp.error === "name"
//
// Values are either a `Banner` object or a function of `sp` returning
// one (for banners whose message interpolates other query params, like
// `sp.msg`).
//
// The first matching entry wins, in declaration order — so put the
// most specific errors before the catch-all `error:invalid`.

export type BannerTone = "success" | "error" | "info";
export type Banner = { tone: BannerTone; msg: string };

type BannerDef =
  | Banner
  | {
      tone: BannerTone;
      msg: (sp: Record<string, string | undefined>) => string;
    };

export type BannerMap = Record<string, BannerDef>;

export function resolveBanner(
  sp: Record<string, string | undefined>,
  map: BannerMap,
): Banner | null {
  for (const [key, def] of Object.entries(map)) {
    const matches = key.startsWith("error:")
      ? sp.error === key.slice("error:".length)
      : sp[key] === "1";
    if (!matches) continue;
    return {
      tone: def.tone,
      msg: typeof def.msg === "function" ? def.msg(sp) : def.msg,
    };
  }
  return null;
}
