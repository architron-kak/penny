import { afterEach, describe, expect, it, vi } from "vitest";
import { CashierListener, readCashierTotal, type Recognition } from "../lib/cashier-listener";

function setup(available = true) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
  const engines: Recognition[] = [];
  const onAmount = vi.fn(),
    onStatus = vi.fn();
  const listener = new CashierListener({
    createRecognition: () => {
      if (!available) return null;
      const engine: Recognition = {
        lang: "",
        interimResults: false,
        continuous: false,
        onresult: null,
        onerror: null,
        onend: null,
        start: vi.fn(),
        abort: vi.fn(),
      };
      engines.push(engine);
      return engine;
    },
    currency: () => "USD",
    onAmount,
    onStatus,
  });
  const say = (text: string, final = true) =>
    engines.at(-1)?.onresult?.({
      results: [{ isFinal: final, 0: { transcript: text } }],
    });
  const enable = () => {
    listener.setSuspended(false);
    listener.setEnabled(true);
  };
  return { listener, engines, onAmount, onStatus, say, enable };
}
afterEach(() => vi.useRealTimers());

describe("automatic cashier detection", () => {
  it("stays off until enabled and waits while a dialog or hidden page suspends it", () => {
    const t = setup();
    t.listener.setSuspended(false);
    expect(t.engines).toHaveLength(0);
    t.listener.setSuspended(true);
    t.listener.setEnabled(true);
    expect(t.engines).toHaveLength(0);
    t.listener.setSuspended(false);
    expect(t.engines).toHaveLength(1);
  });
  it("stops at one minute with no total and does not restart on foreground return", () => {
    const t = setup();
    t.enable();
    t.say("Hello, welcome to the store");
    vi.advanceTimersByTime(59_999);
    expect(t.onStatus).toHaveBeenLastCalledWith("listening");
    vi.advanceTimersByTime(1);
    expect(t.onStatus).toHaveBeenLastCalledWith("timeout");
    expect(t.engines[0].abort).toHaveBeenCalledOnce();
    t.listener.setSuspended(true);
    t.listener.setSuspended(false);
    expect(t.engines).toHaveLength(1);
    expect(t.onAmount).not.toHaveBeenCalled();
  });
  it("ignores interim speech, unrelated numbers, ambiguous and overlong totals", () => {
    const t = setup();
    t.enable();
    t.say("The total is 24 dollars", false);
    t.say("See you at nine");
    t.say("The total is 24 dollars or 25 dollars");
    t.say("x".repeat(1001) + " 24 dollars");
    expect(t.onAmount).not.toHaveBeenCalled();
    expect(t.engines[0].abort).not.toHaveBeenCalled();
  });
  it("releases the microphone before handing off exactly one final amount", () => {
    const t = setup();
    t.enable();
    const lateResult = t.engines[0].onresult;
    t.onAmount.mockImplementation(() => expect(t.engines[0].abort).toHaveBeenCalledOnce());
    t.say("The total is twenty-four dollars and fifty cents");
    expect(t.onAmount).toHaveBeenCalledWith({
      amount: { ok: true, amountMinor: 2450, currency: "USD" },
      transcript: "The total is twenty-four dollars and fifty cents",
    });
    lateResult?.({ results: [{ isFinal: true, 0: { transcript: "The total is 50 dollars" } }] });
    vi.advanceTimersByTime(60_000);
    t.listener.setSuspended(true);
    t.listener.setSuspended(false);
    expect(t.onAmount).toHaveBeenCalledOnce();
    expect(t.onStatus).toHaveBeenLastCalledWith("detected");
    expect(t.engines).toHaveLength(1);
  });
  it("uses a newly finalized utterance without mixing earlier ambient numbers", () => {
    const t = setup();
    t.enable();
    t.engines[0].onresult?.({
      resultIndex: 1,
      results: [
        { isFinal: true, 0: { transcript: "There are two bags" } },
        { isFinal: true, 0: { transcript: "The total is 24.50" } },
      ],
    });
    expect(t.onAmount.mock.calls[0][0].amount.amountMinor).toBe(2450);
  });
  it("keeps the original deadline across silence and browser reconnects", () => {
    const t = setup();
    t.enable();
    vi.advanceTimersByTime(20_000);
    t.engines[0].onerror?.({ error: "no-speech" });
    vi.advanceTimersByTime(1000);
    expect(t.engines).toHaveLength(2);
    vi.advanceTimersByTime(20_000);
    t.engines[1].onend?.();
    vi.advanceTimersByTime(500);
    expect(t.engines).toHaveLength(3);
    vi.advanceTimersByTime(18_500);
    expect(t.onStatus).toHaveBeenLastCalledWith("timeout");
    expect(t.engines[2].abort).toHaveBeenCalledOnce();
    expect(t.onAmount).not.toHaveBeenCalled();
  });
  it("does not extend its deadline while hidden or covered by a payment dialog", () => {
    const t = setup();
    t.enable();
    vi.advanceTimersByTime(30_000);
    t.listener.setSuspended(true);
    expect(t.engines[0].abort).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30_000);
    t.listener.setSuspended(false);
    expect(t.onStatus).toHaveBeenLastCalledWith("timeout");
    expect(t.engines).toHaveLength(1);
  });
  it("stop stays stopped, while an explicit retry starts a fresh minute", () => {
    const t = setup();
    t.enable();
    t.listener.stop();
    t.listener.setSuspended(true);
    t.listener.setSuspended(false);
    vi.advanceTimersByTime(60_000);
    expect(t.engines).toHaveLength(1);
    t.listener.restart();
    expect(t.engines).toHaveLength(2);
    vi.advanceTimersByTime(60_000);
    expect(t.onStatus).toHaveBeenLastCalledWith("timeout");
  });
  it("does not loop after denied permission or an unavailable browser", () => {
    const t = setup();
    t.enable();
    t.engines[0].onerror?.({ error: "not-allowed" });
    t.listener.setSuspended(true);
    t.listener.setSuspended(false);
    vi.advanceTimersByTime(60_000);
    expect(t.onStatus).toHaveBeenLastCalledWith("blocked");
    expect(t.engines).toHaveLength(1);
    const unavailable = setup(false);
    unavailable.enable();
    expect(unavailable.onStatus).toHaveBeenLastCalledWith("unavailable");
  });
  it("releases recognition and all timers on opt-out or unmount", () => {
    const t = setup();
    t.enable();
    t.listener.setEnabled(false);
    expect(t.engines[0].abort).toHaveBeenCalledOnce();
    expect(t.onStatus).toHaveBeenLastCalledWith("off");
    t.listener.setEnabled(true);
    t.engines[1].onend?.();
    t.listener.dispose();
    vi.advanceTimersByTime(60_000);
    expect(t.engines).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("ambient totals need payment context", () => {
  it.each([
    "nine",
    "There are two bags",
    "See you at 7",
    "The total is $24 or $25",
    "The price is -24 dollars",
  ])("ignores %s", (text) => {
    expect(readCashierTotal(text, "USD")).toBeNull();
  });
  it.each([
    ["24 dollars and 50 cents", 2450, "USD"],
    ["Your total is 24.50", 2450, "USD"],
    ["That will be twenty-four", 2400, "USD"],
    ["The price is 30 euros", 3000, "EUR"],
    ["4 500 tenge", 450000, "KZT"],
  ])("recognizes %s", (text, amountMinor, currency) => {
    expect(readCashierTotal(String(text), "USD")).toEqual({ ok: true, amountMinor, currency });
  });
});
