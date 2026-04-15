import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { makePhotoKey, isPhotoKeyOwnedBy, PHOTO_LIMITS } from "@/lib/r2";

describe("PHOTO_LIMITS", () => {
  it("matches CLAUDE.md rule #6", () => {
    expect(PHOTO_LIMITS.MAX_PHOTOS_PER_FLIGHT).toBe(5);
    expect(PHOTO_LIMITS.MAX_BYTES_PER_PHOTO).toBe(10 * 1024 * 1024);
    expect(PHOTO_LIMITS.ALLOWED_MIME_TYPES).toEqual([
      "image/jpeg",
      "image/png",
      "image/heic",
    ]);
  });
});

describe("makePhotoKey", () => {
  const USER = randomUUID();

  it("produces the documented shape `flights/{userId}/{uuid}.jpg`", () => {
    const key = makePhotoKey(USER);
    expect(key).toMatch(
      new RegExp(`^flights/${USER}/[0-9a-f-]{36}\\.jpg$`, "i"),
    );
  });

  it("throws on non-UUID userId", () => {
    expect(() => makePhotoKey("not-a-uuid")).toThrow();
    expect(() => makePhotoKey("")).toThrow();
  });

  it("returns distinct keys on each call", () => {
    const a = makePhotoKey(USER);
    const b = makePhotoKey(USER);
    expect(a).not.toBe(b);
  });
});

describe("isPhotoKeyOwnedBy — security", () => {
  const USER_A = randomUUID();
  const USER_B = randomUUID();
  const OWN_KEY = makePhotoKey(USER_A);

  it("accepts the pilot's own key", () => {
    expect(isPhotoKeyOwnedBy(OWN_KEY, USER_A)).toBe(true);
  });

  it("rejects another user's key", () => {
    expect(isPhotoKeyOwnedBy(OWN_KEY, USER_B)).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(
      isPhotoKeyOwnedBy(`flights/${USER_A}/../${USER_B}/evil.jpg`, USER_A),
    ).toBe(false);
  });

  it("rejects extra path segments", () => {
    expect(
      isPhotoKeyOwnedBy(`flights/${USER_A}/nested/key.jpg`, USER_A),
    ).toBe(false);
  });

  it("rejects a missing user segment", () => {
    expect(isPhotoKeyOwnedBy(`flights/${randomUUID()}.jpg`, USER_A)).toBe(
      false,
    );
  });

  it("rejects wrong extensions", () => {
    expect(
      isPhotoKeyOwnedBy(`flights/${USER_A}/${randomUUID()}.exe`, USER_A),
    ).toBe(false);
    expect(
      isPhotoKeyOwnedBy(`flights/${USER_A}/${randomUUID()}`, USER_A),
    ).toBe(false);
  });

  it("accepts jpeg/png/heic extensions", () => {
    for (const ext of ["jpg", "jpeg", "png", "heic", "JPG", "PNG"]) {
      const key = `flights/${USER_A}/${randomUUID()}.${ext}`;
      expect(isPhotoKeyOwnedBy(key, USER_A)).toBe(true);
    }
  });

  it("rejects non-string keys", () => {
    expect(isPhotoKeyOwnedBy(undefined as unknown as string, USER_A)).toBe(
      false,
    );
    expect(isPhotoKeyOwnedBy(null as unknown as string, USER_A)).toBe(false);
    expect(isPhotoKeyOwnedBy(42 as unknown as string, USER_A)).toBe(false);
  });

  it("rejects if userId is itself malformed (defensive)", () => {
    expect(isPhotoKeyOwnedBy(OWN_KEY, "not-a-uuid")).toBe(false);
  });
});
