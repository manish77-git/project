import { describe, expect, it } from "vitest";
import { MAX_CHALLENGE_ATTEMPTS, THROTTLE_WINDOW_MINUTES } from "./policy";
import { createInMemoryThrottle, createStorageManagedThrottle } from "./throttle";
import { at, newStore } from "./__fixtures__/test-access";

const BILL = "INV-2026-0042";
const OTHER_BILL = "INV-2026-0043";
const CLIENT = "203.0.113.7";

describe("createInMemoryThrottle", () => {
  it("allows attempts until the limit and then reports the remaining wait", async () => {
    const throttle = createInMemoryThrottle(newStore());
    const input = { billNumber: BILL, clientKey: CLIENT, now: new Date("2026-10-16T10:00:00.000Z") };

    for (let attempt = 1; attempt < MAX_CHALLENGE_ATTEMPTS; attempt += 1) {
      expect(await throttle.registerFailure(input)).toBeNull();
      expect(await throttle.check(input)).toBeNull();
    }

    // The last allowed failure is the one that arms the window.
    expect(await throttle.registerFailure(input)).toBe(THROTTLE_WINDOW_MINUTES * 60);
    expect(await throttle.check(input)).toBe(THROTTLE_WINDOW_MINUTES * 60);
  });

  it("counts down and releases the bill exactly at the end of the window", async () => {
    const throttle = createInMemoryThrottle(newStore());
    const start = new Date("2026-10-16T10:00:00.000Z");
    const base = { billNumber: BILL, clientKey: CLIENT, now: start };
    for (let i = 0; i < MAX_CHALLENGE_ATTEMPTS; i += 1) {
      await throttle.registerFailure(base);
    }

    expect(await throttle.check({ ...base, now: at(THROTTLE_WINDOW_MINUTES - 0.5, start) })).toBe(30);
    expect(await throttle.check({ ...base, now: at(THROTTLE_WINDOW_MINUTES, start) })).toBeNull();
  });

  it("throttles the bill for every client, not just the one that failed", async () => {
    const throttle = createInMemoryThrottle(newStore());
    const start = new Date("2026-10-16T10:00:00.000Z");
    for (let i = 0; i < MAX_CHALLENGE_ATTEMPTS; i += 1) {
      await throttle.registerFailure({ billNumber: BILL, clientKey: CLIENT, now: start });
    }

    // A different client on the same bill inherits the bill bucket's budget.
    expect(await throttle.check({ billNumber: BILL, clientKey: "198.51.100.9", now: start })).not.toBeNull();
  });

  it("throttles a client that moves on to another bill", async () => {
    const throttle = createInMemoryThrottle(newStore());
    const start = new Date("2026-10-16T10:00:00.000Z");
    for (let i = 0; i < MAX_CHALLENGE_ATTEMPTS; i += 1) {
      await throttle.registerFailure({ billNumber: BILL, clientKey: CLIENT, now: start });
    }

    expect(await throttle.check({ billNumber: OTHER_BILL, clientKey: CLIENT, now: start })).not.toBeNull();
    // ...while an unrelated client on that other bill is unaffected.
    expect(await throttle.check({ billNumber: OTHER_BILL, clientKey: "198.51.100.9", now: start })).toBeNull();
  });

  it("keeps no client bucket when no client can be identified", async () => {
    const throttle = createInMemoryThrottle(newStore());
    const start = new Date("2026-10-16T10:00:00.000Z");
    for (let i = 0; i < MAX_CHALLENGE_ATTEMPTS; i += 1) {
      await throttle.registerFailure({ billNumber: BILL, clientKey: null, now: start });
    }

    expect(await throttle.check({ billNumber: BILL, clientKey: null, now: start })).not.toBeNull();
    expect(await throttle.check({ billNumber: OTHER_BILL, clientKey: null, now: start })).toBeNull();
  });

  it("forgets the failures when cleared, which is what a correct answer does", async () => {
    const throttle = createInMemoryThrottle(newStore());
    const input = { billNumber: BILL, clientKey: CLIENT, now: new Date("2026-10-16T10:00:00.000Z") };
    for (let i = 0; i < MAX_CHALLENGE_ATTEMPTS; i += 1) {
      await throttle.registerFailure(input);
    }

    await throttle.clear(input);
    expect(await throttle.check(input)).toBeNull();
  });
});

describe("createStorageManagedThrottle", () => {
  it("never reports a wait of its own, because the code store owns the lockout", async () => {
    const throttle = createStorageManagedThrottle();
    const input = { billNumber: BILL, clientKey: CLIENT, now: new Date("2026-10-16T10:00:00.000Z") };

    expect(await throttle.check(input)).toBeNull();
    for (let i = 0; i < 10; i += 1) {
      expect(await throttle.registerFailure(input)).toBeNull();
    }
    expect(await throttle.check(input)).toBeNull();
    await expect(throttle.clear(input)).resolves.toBeUndefined();
  });
});
