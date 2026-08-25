"use client";

import { useState } from "react";

import { createBrowserSupabaseClient } from "../../lib/supabase/client";

const LOGOUT_ERROR = "Không thể đăng xuất. Vui lòng thử lại.";

export function AccountMenu({ email }: { email?: string }) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function signOut() {
    setErrorMessage("");
    setIsSigningOut(true);

    try {
      const { error } = await createBrowserSupabaseClient().auth.signOut();
      if (error) {
        setErrorMessage(LOGOUT_ERROR);
        return;
      }

      window.location.assign("/login");
    } catch {
      setErrorMessage(LOGOUT_ERROR);
    } finally {
      setIsSigningOut(false);
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
        disabled={isSigningOut}
        aria-busy={isSigningOut}
        aria-label={isSigningOut ? "Đang đăng xuất" : "Đăng xuất"}
      >
        {isSigningOut ? "Đang đăng xuất…" : "Đăng xuất"}
      </button>
      <p className="account-menu-error" role="status" aria-live="polite">
        {errorMessage}
      </p>
    </div>
  );
}
