"use client";

import { FormEvent, useState } from "react";

import { createBrowserSupabaseClient } from "../../lib/supabase/client";

const SIGN_IN_ERROR =
  "Không thể đăng nhập. Vui lòng kiểm tra email và mật khẩu rồi thử lại.";

export default function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState(initialError ?? "");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(SIGN_IN_ERROR);
        return;
      }

      window.location.assign(next);
    } catch {
      setErrorMessage(SIGN_IN_ERROR);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label htmlFor="login-email">Email</label>
      <input
        id="login-email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="ban@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={isLoading}
        required
      />

      <label htmlFor="login-password">Mật khẩu</label>
      <input
        id="login-password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Nhập mật khẩu"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={isLoading}
        required
      />

      <p className="login-error" role="alert" aria-live="polite">
        {errorMessage}
      </p>

      <button type="submit" disabled={isLoading} aria-busy={isLoading}>
        {isLoading ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
