import type { Metadata } from "next";

import ResetPasswordForm from "./reset-password-form";

export const metadata: Metadata = { title: "Đặt lại mật khẩu — PRO7 Team Manager" };

export default function ResetPasswordPage() {
  return <main className="login-shell"><section className="login-card" aria-labelledby="reset-title">
    <div className="login-brand" aria-label="PRO7 Team Manager"><span aria-hidden="true">7</span><div><strong>PRO7</strong><small>TEAM MANAGER</small></div></div>
    <div className="login-copy"><p>BẢO MẬT TÀI KHOẢN</p><h1 id="reset-title">Đặt lại mật khẩu</h1><span>Dùng mật khẩu mạnh có chữ, số và ký tự đặc biệt.</span></div>
    <ResetPasswordForm />
  </section></main>;
}
