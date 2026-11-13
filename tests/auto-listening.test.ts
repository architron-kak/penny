import { afterEach, describe, it, expect, vi } from "vitest";
import {
  readAutoListening,
  writeAutoListening,
  autoListeningKey,
  subscribeAutoListening,
} from "../lib/auto-listening";
afterEach(() => vi.unstubAllGlobals());
describe("opt-in automatic listening preference", () => {
  it("is off on the server and on a new device", () => {
    vi.stubGlobal("window", undefined);
    expect(readAutoListening("alice")).toBe(false);
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });
    expect(readAutoListening("alice")).toBe(false);
  });
  it("remembers a boolean separately for each account and supports turning it off", () => {
    const values = new Map<string, string>(),
      dispatchEvent = vi.fn();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => values.set(k, v),
      },
      dispatchEvent,
    });
    expect(writeAutoListening("alice", true)).toBe(true);
    expect(readAutoListening("alice")).toBe(true);
    expect(readAutoListening("bob")).toBe(false);
    expect(values.get(autoListeningKey("alice"))).toBe("true");
    expect(writeAutoListening("alice", false)).toBe(true);
    expect(readAutoListening("alice")).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
  });
  it("fails closed when browser storage is blocked", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw Error("blocked");
      },
    });
    expect(readAutoListening("alice")).toBe(false);
    expect(writeAutoListening("alice", true)).toBe(false);
  });
  it("removes cross-tab and local preference subscriptions on cleanup", () => {
    const addEventListener = vi.fn(),
      removeEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener, removeEventListener });
    const listener = vi.fn();
    const cleanup = subscribeAutoListening(listener);
    expect(addEventListener).toHaveBeenCalledTimes(2);
    cleanup();
    expect(removeEventListener).toHaveBeenCalledTimes(2);
  });
});
