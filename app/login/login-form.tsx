"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { normalizeLoginIdentifier } from "../../lib/account/login-identifier";
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
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError ?? "");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    try {
      const normalized = normalizeLoginIdentifier(identifier);
      if (!normalized.ok) {
        setErrorMessage(SIGN_IN_ERROR);
        return;
      }
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: normalized.authEmail,
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
      <label htmlFor="login-identifier">Email hoặc username</label>
      <input
        id="login-identifier"
        name="identifier"
        type="text"
        autoComplete="username"
        placeholder="duclee hoặc email@example.com"
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        disabled={isLoading}
        required
      />

      <div className="login-label-row"><label htmlFor="login-password">Mật khẩu</label><a href="/account/forgot-password">Quên mật khẩu?</a></div>
      <div className="password-field">
        <input
          id="login-password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isLoading}
          required
        />
        <button type="button" className="password-visibility" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} onClick={() => setShowPassword((current) => !current)} disabled={isLoading}>
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <p className="login-error" role="alert" aria-live="polite">
        {errorMessage}
      </p>

      <button type="submit" disabled={isLoading} aria-busy={isLoading}>
        {isLoading ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
