"use client";

import { useState, type FormEvent } from "react";

import { passwordRecoveryRedirect, validateRecoveryEmail } from "../../../lib/account/password-recovery";
import { createBrowserSupabaseClient } from "../../../lib/supabase/client";

const NEUTRAL_SUCCESS = "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const validation = validateRecoveryEmail(email);
    if (!validation.ok) { setError(validation.message); return; }
    setPending(true);
    try {
      await createBrowserSupabaseClient().auth.resetPasswordForEmail(validation.email, {
        redirectTo: passwordRecoveryRedirect(window.location.origin),
      });
      setMessage(NEUTRAL_SUCCESS);
    } catch {
      setMessage(NEUTRAL_SUCCESS);
    } finally {
      setPending(false);
    }
  }

  return <form className="login-form" onSubmit={submit} noValidate>
    <label htmlFor="recovery-email">Email</label>
    <input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} required />
    <p className="login-error" role="alert">{error}</p>
    {message && <p className="login-success" role="status">{message}</p>}
    <button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Đang gửi…" : "Gửi hướng dẫn"}</button>
    <a className="login-secondary-link" href="/login">Quay lại đăng nhập</a>
  </form>;
}
