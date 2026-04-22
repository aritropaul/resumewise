/** Thin wrapper around the Analythicc tracker (`window.ana`). */

declare global {
  interface Window {
    ana?: (type: string, event: string) => void;
  }
}

export function track(event: string) {
  if (typeof window !== "undefined" && window.ana) {
    window.ana("event", event);
  }
}
