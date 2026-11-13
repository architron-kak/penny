"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CashierListener,
  createSpeechRecognition,
  type CashierDetection,
  type CashierStatus,
} from "@/lib/cashier-listener";
import type { Currency } from "@/lib/private/types";

export function useCashierListener({
  userId,
  enabled,
  suspended,
  currency,
  onAmount,
}: {
  userId: string;
  enabled: boolean;
  suspended: boolean;
  currency: Currency;
  onAmount: (detection: CashierDetection) => void;
}) {
  const [status, setStatus] = useState<CashierStatus>("off");
  const controller = useRef<CashierListener | null>(null);
  const values = useRef({ currency, onAmount, suspended, enabled });
  const refresh = useRef<(() => void) | null>(null);
  useEffect(() => {
    values.current = { currency, onAmount, suspended, enabled };
  }, [currency, onAmount, suspended, enabled]);
  useEffect(() => {
    const listener = new CashierListener({
      createRecognition: createSpeechRecognition,
      currency: () => values.current.currency,
      onStatus: setStatus,
      onAmount: (amount) => values.current.onAmount(amount),
    });
    controller.current = listener;
    let leaving = false;
    const update = () =>
      listener.setSuspended(
        leaving ||
          document.hidden ||
          values.current.suspended ||
          new URLSearchParams(window.location.search).has("checkout") ||
          !!document.querySelector("dialog[open]"),
      );
    const hide = () => {
      leaving = true;
      update();
    };
    const show = () => {
      leaving = false;
      update();
    };
    // Modal state changes, including the existing PayPal review, suspend recognition.
    const observer = new MutationObserver((records) => {
      if (!values.current.enabled) return;
      if (
        records.some(
          (r) =>
            r.type === "attributes" ||
            [...r.addedNodes, ...r.removedNodes].some(
              (n) => n instanceof Element && (n.matches("dialog") || n.querySelector("dialog")),
            ),
        )
      )
        update();
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["open"],
      childList: true,
      subtree: true,
    });
    refresh.current = update;
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      listener.dispose();
      controller.current = null;
      refresh.current = null;
    };
  }, [userId]);
  useEffect(() => {
    refresh.current?.();
    controller.current?.setEnabled(enabled);
  }, [enabled, suspended, userId]);
  const stop = useCallback(() => controller.current?.stop(), []);
  const restart = useCallback(() => {
    refresh.current?.();
    controller.current?.restart();
  }, []);
  return { status, stop, restart };
}
