"use client";

import { useState } from "react";

import { createBrowserSupabaseClient } from "../../lib/supabase/client";
import {
  getLogoutPresentation,
  requestLocalLogout,
  type LogoutPhase,
} from "./product-shell-controls";

export function AccountMenu({ email }: { email?: string }) {
  const [phase, setPhase] = useState<LogoutPhase>("idle");
  const presentation = getLogoutPresentation(phase);

  async function signOut() {
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
    <div className="account-menu">
      <div className="account-menu-identity">
        <span>Tài khoản</span>
        <strong>{email ?? "Tài khoản đã xác minh"}</strong>
      </div>
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
      <p className="account-menu-error" role="status" aria-live="polite">
        {presentation.errorMessage}
      </p>
    </div>
  );
}
