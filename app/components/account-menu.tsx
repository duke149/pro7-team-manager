"use client";

import { LogOut, Settings, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { createBrowserSupabaseClient } from "../../lib/supabase/client";
import {
  getLogoutPresentation,
  requestLocalLogout,
  type LogoutPhase,
} from "./product-shell-controls";

export function AccountMenu({ email, settingsHref }: { email?: string; settingsHref?: string }) {
  const [phase, setPhase] = useState<LogoutPhase>("idle");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);
  const presentation = getLogoutPresentation(phase);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();

    function closeAndRestoreFocus() {
      triggerRef.current?.focus();
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndRestoreFocus();
    }

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  async function signOut() {
    setOpen(false);
    setPhase("pending");

    try {
      const supabase = createBrowserSupabaseClient();
      const didRedirect = await requestLocalLogout({
        signOut: (options) => supabase.auth.signOut(options),
        getSession: () => supabase.auth.getSession(),
        replace: (href) => window.location.replace(href),
      });
      if (!didRedirect) setPhase("error");
    } catch {
      setPhase("error");
    }
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <div className="account-menu-desktop">
        <div className="account-menu-identity">
          <span>Tài khoản</span>
          <strong>{email ?? "Tài khoản đã xác minh"}</strong>
        </div>
        <a className="profile-button" href="/account/profile">
          Hồ sơ
        </a>
        {settingsHref && <a className="profile-button" href={settingsHref}>Cài đặt đội</a>}
        <button
          className="logout-button"
          type="button"
          onClick={signOut}
          disabled={presentation.disabled}
          aria-busy={presentation.disabled}
          aria-label={presentation.ariaLabel}
        >
          {presentation.label}
        </button>
      </div>
      <button
        ref={triggerRef}
        className="account-menu-trigger"
        type="button"
        aria-label="Mở menu tài khoản"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <UserRound size={19} aria-hidden="true" />
      </button>
      {open && <div className="account-menu-popover" role="menu" aria-label="Tài khoản">
        <div className="account-menu-summary"><span>Tài khoản</span><strong>{email ?? "Tài khoản đã xác minh"}</strong></div>
        <a ref={firstItemRef} role="menuitem" href="/account/profile" onClick={() => setOpen(false)}><UserRound size={17} aria-hidden="true" />Hồ sơ</a>
        {settingsHref && <a role="menuitem" href={settingsHref} onClick={() => setOpen(false)}><Settings size={17} aria-hidden="true" />Cài đặt đội</a>}
        <button role="menuitem" type="button" onClick={signOut} disabled={presentation.disabled} aria-busy={presentation.disabled} aria-label={presentation.ariaLabel}><LogOut size={17} aria-hidden="true" />{presentation.label}</button>
      </div>}
      <p className="account-menu-error" role="status" aria-live="polite">
        {presentation.errorMessage}
      </p>
    </div>
  );
}
