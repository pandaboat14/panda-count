"use client";

import { useSyncExternalStore } from "react";

const subscribeMotion = (cb: () => void) => {
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

// True when the viewer asked for reduced motion (and during SSR, so nothing animates before hydration).
export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
}
