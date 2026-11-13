"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Ear, Mic, Square } from "lucide-react";
import { readSpokenAmount, type HeardAmount } from "@/lib/spoken-amount";
import type { Currency } from "@/lib/private/types";
import { formatCurrency } from "@/lib/currency";
type Amount = Extract<HeardAmount, { ok: true }>;
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
const subscribe = () => () => {};
const supported = () =>
  !!(
    (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition
  );
export default function CheckoutAssist({
  currency: initialCurrency,
  accountCurrencies,
  busy,
  onRecord,
  onPayment,
}: {
  currency: Currency;
  accountCurrencies: Currency[];
  busy: boolean;
  onRecord: (amount: Amount) => void;
  onPayment: (amount: Amount) => void;
}) {
  const hasSpeech = useSyncExternalStore(subscribe, supported, () => false);
  const [currency, setCurrency] = useState<Currency>(initialCurrency),
    [caption, setCaption] = useState(""),
    [listening, setListening] = useState(false),
    [notice, setNotice] = useState("Press Start listening, or type what the cashier said."),
    [heard, setHeard] = useState<HeardAmount | null>(null),
    [manual, setManual] = useState<string | null>(null),
    [checked, setChecked] = useState(false);
  const instance = useRef<Recognition | null>(null),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const release = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    const current = instance.current;
    instance.current = null;
    if (current) {
      current.onresult = null;
      current.onerror = null;
      current.onend = null;
      current.abort();
    }
  }, []);
  useEffect(() => {
    function onHidden() {
      if (document.hidden && instance.current) {
        release();
        setListening(false);
        setNotice(
          "Listening stopped because the page was hidden. Start it again when you are ready.",
        );
      }
    }
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      release();
    };
  }, [release]);
  function parse(text: string) {
    const result = readSpokenAmount(text, currency);
    setHeard(result);
    setManual(null);
    setChecked(false);
    if (result.ok) setCurrency(result.currency);
    setNotice(
      result.ok
        ? "Amount found. Check it against the bill or cashier’s display before continuing."
        : "Please check the transcript or enter the amount manually.",
    );
  }
  function start() {
    release();
    setHeard(null);
    setManual(null);
    setChecked(false);
    setCaption("");
    const Ctor =
      (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Ctor) return;
    const current = new Ctor();
    instance.current = current;
    current.lang = "en-US";
    current.interimResults = true;
    current.continuous = false;
    current.onresult = (event) => {
      if (instance.current !== current) return;
      const results = Array.from(event.results),
        text = results
          .map((r) => r[0]?.transcript || "")
          .join(" ")
          .slice(0, 1000);
      setCaption(text);
      if (results.length && results.every((r) => r.isFinal)) {
        release();
        setListening(false);
        parse(text);
      } else {
        setHeard(null);
        setChecked(false);
        setNotice("Listening… this caption is provisional. Wait for the final amount.");
      }
    };
    current.onerror = (event) => {
      if (instance.current !== current) return;
      release();
      setListening(false);
      setHeard(null);
      setChecked(false);
      setNotice(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was denied. Type the cashier’s words or amount instead."
          : "Speech recognition could not finish. Type the amount instead.",
      );
    };
    current.onend = () => {
      if (instance.current === current) {
        release();
        setListening(false);
        setNotice("Listening ended. Read the typed caption or enter an amount below.");
      }
    };
    setListening(true);
    setNotice("Listening now. You will see the words here; no payment is sent.");
    try {
      current.start();
      if (instance.current === current)
        timeout.current = setTimeout(() => {
          release();
          setListening(false);
          setNotice("Listening stopped after 30 seconds. You can read the caption or try again.");
        }, 30000);
    } catch {
      release();
      setListening(false);
      setNotice("The microphone could not start. You can type the amount instead.");
    }
  }
  const result = manual !== null ? readSpokenAmount(manual, currency) : heard;
  const amount = result?.ok ? result : null,
    canRecord = !!amount && accountCurrencies.includes(amount.currency);
  function handoff(action: (a: Amount) => void) {
    if (!amount || !checked || listening || busy) return;
    release();
    action(amount);
  }
  return (
    <section className="checkout-assist" aria-label="Checkout assist">
      <span className="checkout-assist-badge">
        <Ear size={17} /> VISUAL CHECKOUT
      </span>
      <h2>See the amount. Stay in control.</h2>
      <p>
        Capture one spoken total as text. Speech recognition can make mistakes — check the bill or
        cashier’s display.
      </p>
      <div className="checkout-listening-controls">
        <button
          type="button"
          className="dark-button"
          disabled={busy || !hasSpeech}
          aria-pressed={listening}
          onClick={() => {
            if (listening) {
              release();
              setListening(false);
              setNotice("Microphone stopped. Read the caption or enter the amount below.");
            } else start();
          }}
        >
          {listening ? <Square size={17} /> : <Mic size={17} />}
          {listening ? "Stop listening" : "Start listening"}
        </button>
        <span className={`checkout-listening-state${listening ? " is-listening" : ""}`}>
          {listening ? "● MICROPHONE ON" : "MICROPHONE OFF"}
        </span>
      </div>
      {!hasSpeech && (
        <p className="checkout-fallback">
          Microphone recognition is unavailable in this browser. Typed text and manual amounts work
          below.
        </p>
      )}
      <p className="checkout-notice" role="status">
        {notice}
      </p>
      <div className="checkout-amount-display" aria-live="polite" aria-atomic="true">
        <span>{manual !== null ? "AMOUNT TO CHECK" : "HEARD AMOUNT"}</span>
        <strong>{amount ? formatCurrency(amount.amountMinor, amount.currency) : "—"}</strong>
        <b>{amount?.currency || currency}</b>
      </div>
      <label className="checkout-caption-label">
        Cashier’s words
        <textarea
          aria-label="Cashier transcript"
          maxLength={1000}
          rows={3}
          value={caption}
          disabled={listening}
          placeholder="The total is twenty-four dollars and fifty cents"
          onChange={(e) => {
            setCaption(e.target.value);
            setHeard(null);
            setManual(null);
            setChecked(false);
          }}
        />
      </label>
      <button
        type="button"
        className="outline-button"
        disabled={busy || listening || !caption.trim()}
        onClick={() => parse(caption)}
      >
        Read typed text
      </button>
      {result && !result.ok && (
        <p className="checkout-amount-error" role="alert">
          {result.error}
        </p>
      )}
      <div className="checkout-correction">
        <label>
          Amount
          <input
            aria-label="Checkout amount"
            inputMode="decimal"
            maxLength={32}
            disabled={listening || busy}
            placeholder="24.50"
            value={manual !== null ? manual : amount ? (amount.amountMinor / 100).toFixed(2) : ""}
            onChange={(e) => {
              setManual(e.target.value);
              setChecked(false);
            }}
          />
        </label>
        <label>
          Currency
          <select
            aria-label="Checkout currency"
            value={currency}
            disabled={listening || busy}
            onChange={(e) => {
              const next = e.target.value as Currency;
              if (amount) setManual((amount.amountMinor / 100).toFixed(2));
              setCurrency(next);
              setChecked(false);
            }}
          >
            {(["USD", "EUR", "KZT"] as const).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="checkout-confirm">
        <input
          type="checkbox"
          checked={checked}
          disabled={!amount || listening || busy}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>I checked the amount and currency against the bill or display.</span>
      </label>
      <div className="checkout-next-actions">
        <button
          type="button"
          className="outline-button"
          disabled={!canRecord || !checked || listening || busy}
          onClick={() => handoff(onRecord)}
        >
          <Check size={16} />
          Review expense
        </button>
        <button
          type="button"
          className="dark-button"
          disabled={
            !amount ||
            amount.currency !== "USD" ||
            amount.amountMinor > 500000 ||
            !checked ||
            listening ||
            busy
          }
          onClick={() => handoff(onPayment)}
        >
          Review Sandbox payment
        </button>
      </div>
      {amount && !canRecord && (
        <p className="checkout-fallback">
          Add an account in {amount.currency} to record this expense.
        </p>
      )}
      {amount && (amount.currency !== "USD" || amount.amountMinor > 500000) && (
        <p className="checkout-fallback">
          Sandbox checkout supports USD amounts up to $5,000. You can still review an expense in a
          matching account.
        </p>
      )}
      <small className="checkout-privacy">
        English speech. Your browser may send audio to its speech service. Penny does not record or
        store microphone audio. Opening this panel, listening and recognizing an amount never create
        a payment or a ledger entry. Sandbox payments use test funds for Penny’s test merchant.
      </small>
    </section>
  );
}
