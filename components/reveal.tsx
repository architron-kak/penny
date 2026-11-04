"use client";

import { memo, useEffect, useRef } from "react";
import { useAnimationPreference } from "./animation-provider";

type Entry = { delay: number; effect: "rise" | "grow"; animation?: Animation };
const entries = new WeakMap<Element, Entry>();
let observer: IntersectionObserver | undefined;
let observedCount = 0;

function unobserve(node: Element) {
  if (!entries.has(node)) return;
  observer?.unobserve(node);
  entries.delete(node);
  if (--observedCount === 0) {
    observer?.disconnect();
    observer = undefined;
  }
}

function observe(node: HTMLElement, entry: Entry) {
  if (!observer)
    observer = new IntersectionObserver(
      (changes) => {
        for (const change of changes) {
          const current = entries.get(change.target);
          if (!change.isIntersecting || !current) continue;
          // Nothing is hidden before enhancement. Missing JS/animation support keeps content readable.
          if (document.visibilityState !== "hidden") {
            current.animation = change.target.animate(
              current.effect === "grow"
                ? [{ transform: "scaleY(0.04)" }, { transform: "scaleY(1)" }]
                : [
                    { opacity: 0, transform: "translateY(16px)" },
                    { opacity: 1, transform: "translateY(0)" },
                  ],
              {
                duration: current.effect === "grow" ? 520 : 420,
                delay: current.delay,
                easing: "cubic-bezier(.22,1,.36,1)",
                fill: "backwards",
              },
            );
          }
          unobserve(change.target);
        }
      },
      { threshold: 0.08 },
    );
  entries.set(node, entry);
  observedCount++;
  observer.observe(node);
  return () => {
    entry.animation?.cancel();
    unobserve(node);
  };
}

function useReveal<T extends HTMLElement>(delay: number, effect: Entry["effect"]) {
  const ref = useRef<T>(null);
  const { reduced } = useAnimationPreference();
  useEffect(() => {
    const node = ref.current;
    if (!node || reduced || !("IntersectionObserver" in window) || !("animate" in node)) return;
    const stop = observe(node, { delay: Math.min(delay, 220), effect });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced, delay, effect]);
  return ref;
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useReveal<HTMLDivElement>(delay, "rise");
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export const ChartBar = memo(function ChartBar({
  height,
  current,
  label,
  index,
}: {
  height: number;
  current: boolean;
  label: string;
  index: number;
}) {
  const ref = useReveal<HTMLSpanElement>(index * 32, "grow");
  return (
    <span
      ref={ref}
      className={`chart-bar ${current ? "current" : ""}`}
      style={{ height: `${height}%` }}
      title={label}
    />
  );
});
