"use client";

import { useState, type FormEvent } from "react";

import { validateResetPassword } from "../../../lib/account/password-recovery";
import { createBrowserSupabaseClient } from "../../../lib/supabase/client";

export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    const validation = validateResetPassword(password, confirmation);
    if (!validation.ok) { setError(validation.message); return; }
    setPending(true);
    try {
      const { error: updateError } = await createBrowserSupabaseClient().auth.updateUser({ password: validation.password });
      if (updateError) { setError("Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới."); return; }
      setMessage("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập ngay.");
      setPassword(""); setConfirmation("");
    } catch {
      setError("Không thể cập nhật mật khẩu. Vui lòng thử lại.");
    } finally { setPending(false); }
  }

  return <form className="login-form" onSubmit={submit} noValidate>
    <label htmlFor="reset-password">Mật khẩu mới</label>
    <input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} required />
    <label htmlFor="reset-confirmation">Xác nhận mật khẩu</label>
    <input id="reset-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} required />
    <p className="login-error" role="alert">{error}</p>
    {message && <p className="login-success" role="status">{message}</p>}
    <button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Đang cập nhật…" : "Đặt mật khẩu mới"}</button>
    <a className="login-secondary-link" href="/login">Đăng nhập</a>
  </form>;
}
