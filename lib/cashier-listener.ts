import { readSpokenAmount, type HeardAmount } from "./spoken-amount";
import type { Currency } from "./private/types";

export type RecognizedAmount = Extract<HeardAmount, { ok: true }>;
export type CashierDetection = { amount: RecognizedAmount; transcript: string };
export type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((e: {
        resultIndex?: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
export type CashierStatus =
  | "off"
  | "paused"
  | "listening"
  | "reconnecting"
  | "detected"
  | "timeout"
  | "stopped"
  | "blocked"
  | "unavailable"
  | "error";
export const cashierListeningLimit = 60_000;

export function createSpeechRecognition(): Recognition | null {
  const speechWindow = window as Window & {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  const Ctor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** Automatic prompts need money context; an unrelated spoken number is not a total. */
export function readCashierTotal(text: string, currency: Currency): RecognizedAmount | null {
  if (
    !/[$€₸]|\b(?:usd|eur|kzt|dollars?|euros?|tenge|cents?|tiyn|total|amount|costs?|price|pay|bill)\b|\bthat(?:'s| is| will be)\b/i.test(
      text,
    )
  )
    return null;
  const result = readSpokenAmount(text, currency);
  return result.ok ? result : null;
}

/** One bounded attempt. Pausing or reconnecting never extends its wall-clock deadline. */
export class CashierListener {
  private enabled = false;
  private suspended = true;
  private finished = false;
  private deadline = 0;
  private retries = 0;
  private recognition: Recognition | null = null;
  private limitTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private options: {
      createRecognition: () => Recognition | null;
      currency: () => Currency;
      onStatus: (status: CashierStatus) => void;
      onAmount: (detection: CashierDetection) => void;
    },
  ) {}

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.release();
    this.deadline = 0;
    this.finished = false;
    this.retries = 0;
    if (!enabled) this.options.onStatus("off");
    else this.resume();
  }

  setSuspended(suspended: boolean) {
    this.suspended = suspended;
    if (!this.enabled || this.finished) return;
    if (suspended) {
      this.release();
      this.options.onStatus("paused");
    } else this.resume();
  }

  restart() {
    if (!this.enabled) return;
    this.release();
    this.finished = false;
    this.deadline = 0;
    this.retries = 0;
    this.resume();
  }

  stop() {
    this.finish("stopped");
  }

  dispose() {
    this.finished = true;
    this.release();
  }

  private finish(status: CashierStatus) {
    this.finished = true;
    this.release();
    this.options.onStatus(status);
  }

  private releaseRecognition() {
    const current = this.recognition;
    this.recognition = null;
    if (current) {
      current.onresult = null;
      current.onerror = null;
      current.onend = null;
      current.abort();
    }
  }

  private release() {
    this.releaseRecognition();
    if (this.limitTimer) clearTimeout(this.limitTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.limitTimer = this.retryTimer = null;
  }

  private resume() {
    if (!this.enabled || this.finished || this.suspended || this.recognition || this.retryTimer)
      return;
    if (!this.deadline) this.deadline = Date.now() + cashierListeningLimit;
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) {
      this.finish("timeout");
      return;
    }
    if (!this.limitTimer) this.limitTimer = setTimeout(() => this.finish("timeout"), remaining);
    let current: Recognition | null;
    try {
      current = this.options.createRecognition();
    } catch {
      this.finish("error");
      return;
    }
    if (!current) {
      this.finish("unavailable");
      return;
    }
    this.recognition = current;
    const began = Date.now();
    current.lang = "en-US";
    current.interimResults = true;
    current.continuous = true;
    const reconnect = (silence = false) => {
      if (this.recognition !== current) return;
      this.releaseRecognition();
      this.retries = silence || Date.now() - began >= 5000 ? 0 : this.retries + 1;
      if (this.retries >= 3) {
        this.finish("error");
        return;
      }
      this.options.onStatus("reconnecting");
      this.retryTimer = setTimeout(
        () => {
          this.retryTimer = null;
          this.resume();
        },
        silence ? 1000 : 500,
      );
    };
    current.onresult = (event) => {
      if (this.recognition !== current || this.finished || this.suspended) return;
      if (Date.now() >= this.deadline) {
        this.finish("timeout");
        return;
      }
      const rows = [];
      const first = Math.max(0, event.resultIndex ?? 0);
      if (event.results.length - first > 6) return;
      for (let i = first; i < event.results.length; i++) rows.push(event.results[i]);
      if (!rows.length || rows.some((r) => !r.isFinal)) return;
      const transcript = rows
        .map((r) => r[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript.length > 1000) return;
      const amount = readCashierTotal(transcript, this.options.currency());
      if (!amount) return;
      this.finish("detected"); // Release the microphone before displaying any confirmation.
      this.options.onAmount({ amount, transcript });
    };
    current.onerror = (event) => {
      if (this.recognition !== current) return;
      if (event.error === "no-speech") reconnect(true);
      else
        this.finish(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "blocked"
            : "error",
        );
    };
    current.onend = () => reconnect();
    this.options.onStatus("listening");
    try {
      current.start();
    } catch {
      this.finish("blocked");
    }
  }
}
