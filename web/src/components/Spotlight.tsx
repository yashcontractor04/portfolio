"use client";

import { useEffect } from "react";

/**
 * Cursor spotlight. One pointer listener for the whole page: it finds the card
 * under the cursor (any element with class "spot") and stores the cursor position
 * on it as CSS variables. The glow itself is pure CSS (globals.css).
 * Renders nothing. Does nothing when the user prefers reduced motion.
 */
export function Spotlight() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const card = (event.target as Element | null)?.closest<HTMLElement>(".spot");
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        card.style.setProperty("--my", `${event.clientY - rect.top}px`);
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onMove);
    };
  }, []);
  return null;
}
