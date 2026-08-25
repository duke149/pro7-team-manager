import type { Metadata } from "next";

import { requireProductUser } from "../../../lib/supabase/auth";
import ChangePasswordForm from "./change-password-form";

export const metadata: Metadata = {
  title: "Đổi mật khẩu — PRO7 Team Manager",
};

export default async function ChangePasswordPage() {
  await requireProductUser("/account/change-password");

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="change-password-title">
        <div className="login-brand" aria-label="PRO7 Team Manager">
          <span aria-hidden="true">7</span>
          <div>
            <strong>PRO7</strong>
            <small>TEAM MANAGER</small>
          </div>
        </div>
        <div className="login-copy">
          <p>BẢO MẬT TÀI KHOẢN</p>
          <h1 id="change-password-title">Đổi mật khẩu</h1>
          <span>Hãy thay mật khẩu tạm thời trước khi tiếp tục.</span>
        </div>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
