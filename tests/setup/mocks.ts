// FlightSchedule — R2 mock state (referenced by the hoisted vi.mock in
// tests/setup/integration.ts).
//
// The vi.mock call itself must be at the top of the setup file so
// Vitest's hoister picks it up. This file just holds the mutable state
// the mock reads from.

type R2Mock = {
  uploaded: Set<string>;
  headObjectImpl: (key: string) => Promise<{ contentLength: number }>;
  presignPutUrlImpl: (
    key: string,
    contentType: string,
    contentLength: number,
  ) => Promise<{ url: string; expiresIn: number }>;
  presignGetUrlImpl: (key: string) => Promise<string>;
};

function defaultHead(key: string): Promise<{ contentLength: number }> {
  if (!r2State.uploaded.has(key)) {
    const err = new Error(`NoSuchKey: ${key}`);
    (err as { name?: string }).name = "NotFound";
    return Promise.reject(err);
  }
  return Promise.resolve({ contentLength: 1024 });
}

const r2State: R2Mock = {
  uploaded: new Set(),
  headObjectImpl: defaultHead,
  presignPutUrlImpl: async (key) => ({
    url: `https://r2.fake.test/put/${key}`,
    expiresIn: 900,
  }),
  presignGetUrlImpl: async (key) => `https://r2.fake.test/get/${key}`,
};

export function getR2MockState(): R2Mock {
  return r2State;
}

export function resetR2Mock(): void {
  r2State.uploaded.clear();
  r2State.headObjectImpl = defaultHead;
}

/** Register a photo key as "successfully uploaded" so the next
 *  `headObject(key)` resolves instead of throwing. */
export function markUploaded(key: string): void {
  r2State.uploaded.add(key);
}

/** Directly override the `headObject` mock (e.g. to simulate a 404 on an
 *  already-registered key). */
export function setHeadObjectImpl(
  impl: (key: string) => Promise<{ contentLength: number }>,
): void {
  r2State.headObjectImpl = impl;
}
