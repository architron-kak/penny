"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Ear, Mic, Square } from "lucide-react";
import { readSpokenAmount, type HeardAmount } from "@/lib/spoken-amount";
import type { Currency } from "@/lib/private/types";
import { formatCurrency } from "@/lib/currency";
import {
  createSpeechRecognition,
  type Recognition,
  type CashierDetection,
} from "@/lib/cashier-listener";
type Amount = Extract<HeardAmount, { ok: true }>;
const subscribe = () => () => {};
const supported = () =>
  !!(
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition ||
    (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  );
export default function CheckoutAssist({
  currency: initialCurrency,
  detected,
  accountCurrencies,
  busy,
  onRecord,
  onPayment,
}: {
  currency: Currency;
  detected?: CashierDetection | null;
  accountCurrencies: Currency[];
  busy: boolean;
  onRecord: (amount: Amount) => void;
  onPayment: (amount: Amount) => void;
}) {
  const hasSpeech = useSyncExternalStore(subscribe, supported, () => false);
  const [currency, setCurrency] = useState<Currency>(detected?.amount.currency || initialCurrency),
    [caption, setCaption] = useState(detected?.transcript || ""),
    [listening, setListening] = useState(false),
    [notice, setNotice] = useState(
      detected
        ? "Amount detected. Microphone stopped. Check or edit the amount before continuing."
        : "Press Start listening, or type what the cashier said.",
    ),
    [heard, setHeard] = useState<HeardAmount | null>(detected?.amount || null),
    [manual, setManual] = useState<string | null>(null),
    [checked, setChecked] = useState(false);
  const instance = useRef<Recognition | null>(null),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null),
    currencyRef = useRef(currency);
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
  const parse = useCallback((text: string) => {
    const result = readSpokenAmount(text, currencyRef.current);
    setHeard(result);
    setManual(null);
    setChecked(false);
    if (result.ok) setCurrency(result.currency);
    setNotice(
      result.ok
        ? "Amount found. Check it against the bill or cashier’s display before continuing."
        : "Please check the transcript or enter the amount manually.",
    );
  }, []);
  const start = useCallback(() => {
    release();
    setHeard(null);
    setManual(null);
    setChecked(false);
    setCaption("");
    if (document.hidden) return;
    const current = createSpeechRecognition();
    if (!current) return;
    instance.current = current;
    current.lang = "en-US";
    current.interimResults = true;
    current.continuous = false;
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
        setNotice("Caption too long. Stop listening and enter a clear total.");
        return;
      }
      setCaption(text);
      if (rows.length && rows.every((r) => r.isFinal)) {
        release();
        setListening(false);
        parse(text);
      } else {
        setHeard(null);
        setManual(null);
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
          ? "Microphone access was denied or automatic start was blocked. Tap Start listening to grant access, or type the amount."
          : "Speech recognition could not finish. Tap Start listening to retry, or type the amount.",
      );
    };
    current.onend = () => {
      if (instance.current !== current) return;
      release();
      setListening(false);
      setNotice("Listening ended. Read the typed caption or enter an amount below.");
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
      setNotice(
        "Your browser could not start the microphone automatically. Tap Start listening, or type the amount.",
      );
    }
  }, [parse, release]);
  useEffect(() => {
    function onHidden() {
      if (document.hidden && (instance.current || timeout.current)) {
        release();
        setListening(false);
        setNotice("Microphone off while Penny is hidden. Tap Start listening to try again.");
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
  function pause() {
    release();
    setListening(false);
    setChecked(false);
    setNotice("Microphone stopped. Read the caption or enter the amount below.");
  }
  const result = manual !== null ? readSpokenAmount(manual, currency) : heard;
  const amount = result?.ok ? result : null,
    canRecord = !!amount && accountCurrencies.includes(amount.currency);
  function handoff(action: (a: Amount) => void) {
    if (!amount || !checked || listening || busy) return;
    release();
    action(amount);
  }
  const listeningTools = (
    <>
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
              start();
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
      {!hasSpeech && (
        <p className="checkout-fallback">
          Microphone recognition is unavailable in this browser. Typed text and manual amounts work
          below.
        </p>
      )}
      <p className="checkout-notice" role="status">
        {notice}
      </p>
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
    </>
  );
  return (
    <section className="checkout-assist" aria-label="Checkout assist">
      <span className="checkout-assist-badge">
        <Ear size={17} /> VISUAL CHECKOUT
      </span>
      <h2>{detected ? "Is this the total?" : "See the amount. Stay in control."}</h2>
      <p>
        {detected
          ? listening
            ? "Listening for a corrected total. Stop listening before checking the amount."
            : "Microphone off. Check the total against the bill or display, and correct it below."
          : "Capture one spoken total as text. Speech recognition can make mistakes — check the bill or cashier’s display."}
      </p>
      <div className="checkout-amount-display" aria-live="polite" aria-atomic="true">
        <span>{manual !== null ? "AMOUNT TO CHECK" : "HEARD AMOUNT"}</span>
        <strong>{amount ? formatCurrency(amount.amountMinor, amount.currency) : "—"}</strong>
        <b>{amount?.currency || currency}</b>
      </div>
      {detected ? (
        <details className="checkout-listening-details">
          <summary>Transcript and microphone</summary>
          {listeningTools}
        </details>
      ) : (
        listeningTools
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
      {detected ? (
        <small className="checkout-privacy">
          Nothing is saved or paid until you confirm. PayPal Sandbox uses test funds for Penny’s
          test merchant.
        </small>
      ) : (
        <small className="checkout-privacy">
          English speech. Enable automatic detection in User settings. Automatic listening stops
          after one minute without a clear amount and runs only while Penny is visible. Your browser
          may send audio to its speech service. Penny does not record or store microphone audio.
          Opening this panel, listening and recognizing an amount never create a payment or a ledger
          entry. Sandbox payments use test funds for Penny’s test merchant.
        </small>
      )}
    </section>
  );
}
