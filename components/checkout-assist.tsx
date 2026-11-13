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
  autoListening,
  onAutoListening,
  accountCurrencies,
  busy,
  onRecord,
  onPayment,
}: {
  currency: Currency;
  autoListening: boolean;
  onAutoListening: (enabled: boolean) => boolean;
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
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null),
    paused = useRef(false),
    retries = useRef(0),
    currencyRef = useRef(currency),
    startRef = useRef<((continuous: boolean, fresh?: boolean) => void) | null>(null);
  useEffect(() => {
    currencyRef.current = currency;
  }, [currency]);
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
  const parse = useCallback((text: string, continuous = false) => {
    const result = readSpokenAmount(text, currencyRef.current);
    setHeard(result);
    setManual(null);
    setChecked(false);
    if (result.ok) setCurrency(result.currency);
    setNotice(
      result.ok
        ? continuous
          ? "Amount found. Pause listening to check it against the bill or display."
          : "Amount found. Check it against the bill or cashier’s display before continuing."
        : continuous
          ? "Listening to nearby speech. No single clear total yet."
          : "Please check the transcript or enter the amount manually.",
    );
  }, []);
  const start = useCallback(
    (continuous: boolean, fresh = true) => {
      release();
      if (fresh) {
        setHeard(null);
        setManual(null);
        setChecked(false);
        setCaption("");
        retries.current = 0;
      }
      const Ctor =
        (window as SpeechWindow).SpeechRecognition ||
        (window as SpeechWindow).webkitSpeechRecognition;
      if (!Ctor || document.hidden || paused.current) return;
      const current = new Ctor();
      instance.current = current;
      const began = Date.now();
      current.lang = "en-US";
      current.interimResults = true;
      current.continuous = continuous;
      function restart() {
        release();
        setListening(false);
        if (!continuous || paused.current || document.hidden) return;
        retries.current = Date.now() - began > 5000 ? 0 : retries.current + 1;
        if (retries.current >= 3) {
          paused.current = true;
          setNotice(
            "Your browser keeps stopping speech recognition. Tap Start listening to retry, or type the amount.",
          );
          return;
        }
        setNotice("Auto listening is reconnecting…");
        timeout.current = setTimeout(() => {
          timeout.current = null;
          if (!paused.current && !document.hidden) startRef.current?.(true, false);
        }, 500);
      }
      current.onresult = (event) => {
        if (instance.current !== current) return;
        const rows = [];
        // Bound visible captions and parsing work even in a long listening session.
        for (let i = Math.max(0, event.results.length - 6); i < event.results.length; i++)
          rows.push(event.results[i]);
        const text = rows.map((r) => r[0]?.transcript || "").join(" ");
        if (text.length > 1000) {
          setCaption("");
          setHeard({
            ok: false,
            error: "The caption is too long. Pause and type the final amount.",
          });
          setManual(null);
          setChecked(false);
          setNotice("Listening continues. Pause to enter a clear total.");
          return;
        }
        setCaption(text);
        retries.current = 0;
        if (rows.length && rows.every((r) => r.isFinal)) {
          if (!continuous) {
            release();
            setListening(false);
          }
          parse(text, continuous);
        } else {
          setHeard(null);
          setManual(null);
          setChecked(false);
          setNotice("Listening… this caption is provisional. Wait for the final amount.");
        }
      };
      current.onerror = (event) => {
        if (instance.current !== current) return;
        if (continuous && event.error === "no-speech") {
          restart();
          return;
        }
        release();
        paused.current = true;
        setListening(false);
        setHeard(null);
        setChecked(false);
        setNotice(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "Microphone access was denied or automatic start was blocked. Tap Start listening to grant access, or type the amount."
            : "Speech recognition could not finish. Tap Start listening to retry, or type the amount.",
        );
      };
      current.onend = () => {
        if (instance.current !== current) return;
        if (continuous) restart();
        else {
          release();
          setListening(false);
          setNotice("Listening ended. Read the typed caption or enter an amount below.");
        }
      };
      setListening(true);
      setNotice(
        continuous
          ? "Auto listening is on. Nearby speech appears here. Pause to review an amount."
          : "Listening now. You will see the words here; no payment is sent.",
      );
      try {
        current.start();
        if (!continuous && instance.current === current)
          timeout.current = setTimeout(() => {
            release();
            setListening(false);
            setNotice("Listening stopped after 30 seconds. You can read the caption or try again.");
          }, 30000);
      } catch {
        release();
        paused.current = true;
        setListening(false);
        setNotice(
          "Your browser could not start the microphone automatically. Tap Start listening, or type the amount.",
        );
      }
    },
    [parse, release],
  );
  useEffect(() => {
    startRef.current = start;
  }, [start]);
  useEffect(() => {
    function onHidden() {
      if (document.hidden && (instance.current || timeout.current)) {
        release();
        setListening(false);
        setNotice(
          "Microphone off while Penny is hidden. Auto listening resumes when you return, unless paused.",
        );
      }
    }
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", release);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [release]);
  useEffect(() => {
    if (!autoListening || !hasSpeech) return;
    const resume = () => {
      if (!document.hidden && !paused.current && !instance.current && !timeout.current) start(true);
    };
    const id = setTimeout(resume, 0);
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", resume);
      release();
      setListening(false);
    };
  }, [autoListening, hasSpeech, release, start]);
  function pause() {
    paused.current = true;
    release();
    setListening(false);
    setChecked(false);
    setNotice(
      autoListening
        ? "Microphone paused. Check the amount and currency before continuing. Auto listening remains enabled for the next time you open Penny."
        : "Microphone stopped. Read the caption or enter the amount below.",
    );
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
      <label className="checkout-auto-setting">
        <input
          type="checkbox"
          aria-label="Auto listening when I open Penny"
          checked={autoListening}
          disabled={busy || (!hasSpeech && !autoListening)}
          onChange={(e) => {
            const enabled = e.target.checked;
            if (!enabled) {
              paused.current = true;
              release();
              setListening(false);
            }
            if (!onAutoListening(enabled)) {
              setNotice(
                enabled
                  ? "Your browser could not save Auto listening. You can still use Start listening for this visit."
                  : "Microphone stopped for this visit. Your browser could not save the Auto listening change.",
              );
              return;
            }
            if (enabled) {
              paused.current = false;
              start(true);
            } else {
              paused.current = true;
              release();
              setListening(false);
              setNotice(
                "Auto listening is off. The microphone will not start when you open Penny.",
              );
            }
          }}
        />
        <span>
          <strong>Auto listening when I open Penny</strong>
          <small>
            Remember for this account on this device. Opens Checkout assist and listens to nearby
            speech while Penny is visible.
          </small>
        </span>
      </label>
      <div className="checkout-listening-controls">
        <button
          type="button"
          className="dark-button"
          disabled={busy || !hasSpeech}
          aria-pressed={listening}
          onClick={() => {
            if (listening) {
              pause();
            } else {
              paused.current = false;
              start(autoListening);
            }
          }}
        >
          {listening ? <Square size={17} /> : <Mic size={17} />}
          {listening ? "Stop listening" : "Start listening"}
        </button>
        <span className={`checkout-listening-state${listening ? " is-listening" : ""}`}>
          {listening ? "● MICROPHONE ON" : "MICROPHONE OFF"}
        </span>
      </div>
      {listening && amount && (
        <button type="button" className="outline-button" onClick={pause}>
          Pause to review amount
        </button>
      )}
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
        English speech. Auto listening runs only while Penny is visible and can be stopped at any
        time. Your browser may send audio to its speech service. Penny does not record or store
        microphone audio. Opening this panel, listening and recognizing an amount never create a
        payment or a ledger entry. Sandbox payments use test funds for Penny’s test merchant.
      </small>
    </section>
  );
}
