"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AccessibleModal({
  children,
  labelledBy,
  onClose,
  closeBlocked = false,
  layerClassName = "",
  dialogClassName = "",
}: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  closeBlocked?: boolean;
  layerClassName?: string;
  dialogClassName?: string;
}) {
  const dialog = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const closeBlockedRef = useRef(closeBlocked);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeBlockedRef.current = closeBlocked;
    if (!closeBlocked) return;
    const node = dialog.current;
    const active = document.activeElement;
    const activeDisabled = active instanceof HTMLElement && "disabled" in active && Boolean((active as HTMLButtonElement).disabled);
    if (node && (!(active instanceof HTMLElement) || !node.contains(active) || activeDisabled)) node.focus();
  }, [closeBlocked]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    const focusable = () => [...(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    focusable()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !closeBlockedRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        node?.focus();
        return;
      }
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, []);

  return (
    <div className={`modal-layer ${layerClassName}`.trim()}>
      <section
        ref={dialog}
        className={`modal ${dialogClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
