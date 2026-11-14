"use client";

import { useEffect } from "react";

/**
 * Closes open <details> dropdowns when the visitor clicks outside them or
 * presses Escape. One listener for the whole site. Renders nothing.
 */
export function DismissMenus() {
  useEffect(() => {
    const closeExcept = (keep: Node | null) => {
      for (const menu of document.querySelectorAll("details[open]")) {
        if (!keep || !menu.contains(keep)) menu.removeAttribute("open");
      }
    };
    const onPointerDown = (event: PointerEvent) => closeExcept(event.target as Node);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeExcept(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return null;
}
