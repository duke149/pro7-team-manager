import type { Metadata } from "next";

import ForgotPasswordForm from "./forgot-password-form";

export const metadata: Metadata = { title: "Quên mật khẩu — PRO7 Team Manager" };

export default function ForgotPasswordPage() {
  return <main className="login-shell"><section className="login-card" aria-labelledby="recovery-title">
    <div className="login-brand" aria-label="PRO7 Team Manager"><span aria-hidden="true">7</span><div><strong>PRO7</strong><small>TEAM MANAGER</small></div></div>
    <div className="login-copy"><p>BẢO MẬT TÀI KHOẢN</p><h1 id="recovery-title">Quên mật khẩu</h1><span>Nhập email để nhận liên kết đặt lại mật khẩu.</span></div>
    <ForgotPasswordForm />
  </section></main>;
}
