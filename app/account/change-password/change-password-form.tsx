"use client";

import { FormEvent, useState } from "react";

import { createBrowserSupabaseClient } from "../../../lib/supabase/client";

const CHANGE_PASSWORD_ERROR = "Không thể đổi mật khẩu. Vui lòng thử lại.";
const MANUAL_RECOVERY_ERROR =
  "Không thể hoàn tất đổi mật khẩu. Vui lòng liên hệ quản trị viên.";

async function errorMessageForFunctionFailure(error: unknown): Promise<string> {
  if (
    typeof error !== "object" ||
    error === null ||
    !("context" in error) ||
    !(error.context instanceof Response)
  ) {
    return CHANGE_PASSWORD_ERROR;
  }

  const payload: unknown = await error.context.clone().json().catch(() => null);
  return (
    typeof payload === "object" &&
    payload !== null &&
    "code" in payload &&
    payload.code === "manual_recovery_required"
  )
    ? MANUAL_RECOVERY_ERROR
    : CHANGE_PASSWORD_ERROR;
}

export default function ChangePasswordForm() {
  const [currentTemporaryPassword, setCurrentTemporaryPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function clearFields() {
    setCurrentTemporaryPassword("");
    setNewPassword("");
    setConfirmation("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (newPassword !== confirmation) {
      setErrorMessage("Mật khẩu xác nhận không khớp.");
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setErrorMessage(CHANGE_PASSWORD_ERROR);
        return;
      }

      const { error } = await supabase.functions.invoke(
        "change-temporary-password",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { currentTemporaryPassword, newPassword },
        },
      );
      clearFields();
      if (error) {
        setErrorMessage(await errorMessageForFunctionFailure(error));
        return;
      }

      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        setErrorMessage(CHANGE_PASSWORD_ERROR);
        return;
      }

      window.location.assign("/");
    } catch {
      clearFields();
      setErrorMessage(CHANGE_PASSWORD_ERROR);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label htmlFor="temporary-password">Mật khẩu tạm thời</label>
      <input
        id="temporary-password"
        name="currentTemporaryPassword"
        type="password"
        autoComplete="current-password"
        value={currentTemporaryPassword}
        onChange={(event) => setCurrentTemporaryPassword(event.target.value)}
        disabled={isLoading}
        required
      />

      <label htmlFor="new-password">Mật khẩu mới</label>
      <input
        id="new-password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        disabled={isLoading}
        required
      />

      <label htmlFor="confirm-password">Xác nhận mật khẩu mới</label>
      <input
        id="confirm-password"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={isLoading}
        required
      />

      <p className="login-error" role="alert" aria-live="polite">
        {errorMessage}
      </p>

      <button type="submit" disabled={isLoading} aria-busy={isLoading}>
        {isLoading ? "Đang đổi mật khẩu…" : "Đổi mật khẩu"}
      </button>
    </form>
  );
}
