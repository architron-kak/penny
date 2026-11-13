export const autoListeningEvent = "penny-auto-listening-change";
export const autoListeningKey = (userId: string) => `penny-auto-listening:${userId}`;
export function readAutoListening(userId: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(autoListeningKey(userId)) === "true";
  } catch {
    return false;
  }
}
export function writeAutoListening(userId: string, enabled: boolean) {
  try {
    window.localStorage.setItem(autoListeningKey(userId), String(enabled));
    window.dispatchEvent(new Event(autoListeningEvent));
    return true;
  } catch {
    return false;
  }
}
export function subscribeAutoListening(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(autoListeningEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(autoListeningEvent, listener);
  };
}
