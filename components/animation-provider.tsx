"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { LazyMotion, MotionConfig } from "framer-motion";

const preferenceKey = "penny-reduce-motion";
const preferenceEvent = "penny-motion-preference";
let memoryPreference = false;
let storageUnavailable = false;
const loadFeatures = () => import("./motion-features").then((module) => module.default);
const AnimationContext = createContext({ reduced: true, systemReduced: false, toggle: () => {} });

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(preferenceEvent, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(preferenceEvent, onChange);
  };
}
function manualPreference() {
  if (storageUnavailable) return memoryPreference;
  try {
    return localStorage.getItem(preferenceKey) === "true";
  } catch {
    storageUnavailable = true;
    return memoryPreference;
  }
}
const systemPreference = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const getPreference = () => systemPreference() || manualPreference();
const serverPreference = () => true;
const serverSystemPreference = () => false;

export function AnimationProvider({ children }: { children: React.ReactNode }) {
  const reduced = useSyncExternalStore(subscribe, getPreference, serverPreference);
  const systemReduced = useSyncExternalStore(subscribe, systemPreference, serverSystemPreference);
  const value = useMemo(
    () => ({
      reduced,
      systemReduced,
      toggle() {
        memoryPreference = !manualPreference();
        try {
          localStorage.setItem(preferenceKey, String(memoryPreference));
        } catch {
          storageUnavailable = true;
          /* Private browser storage may be unavailable. */
        }
        window.dispatchEvent(new Event(preferenceEvent));
      },
    }),
    [reduced, systemReduced],
  );

  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? "reduced" : "full";
    return () => {
      delete document.documentElement.dataset.motion;
    };
  }, [reduced]);

  return (
    <AnimationContext.Provider value={value}>
      <LazyMotion features={loadFeatures} strict>
        <MotionConfig
          reducedMotion={reduced ? "always" : "never"}
          transition={{ duration: reduced ? 0 : 0.24 }}
        >
          {children}
        </MotionConfig>
      </LazyMotion>
    </AnimationContext.Provider>
  );
}

export const useAnimationPreference = () => useContext(AnimationContext);
