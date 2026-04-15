// FlightSchedule — Vitest unit-project setup.
//
// Unit tests are pure — no DB, no network. We install a net spy that
// fails the test run fast if anything opens a TCP connection. This
// prevents a future contributor from quietly turning a unit test into
// an integration test (and slowing the suite down).

import net from "node:net";
import { beforeAll, afterAll } from "vitest";

const realConnect = net.Socket.prototype.connect;

beforeAll(() => {
  net.Socket.prototype.connect = function (...args: unknown[]) {
    const err = new Error(
      `[unit test] Refusing TCP connection — unit tests must not open sockets. args=${JSON.stringify(
        args[0] ?? null,
      )}`,
    );
    throw err;
  } as typeof net.Socket.prototype.connect;
});

afterAll(() => {
  net.Socket.prototype.connect = realConnect;
});
