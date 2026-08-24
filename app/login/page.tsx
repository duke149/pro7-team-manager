import type { Metadata } from "next";

import { safeRelativeReturnPath } from "../../lib/supabase/return-path";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Đăng nhập — PRO7 Team Manager",
};

type LoginSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: LoginSearchParams;
}) {
  const params = await searchParams;
  const next = safeRelativeReturnPath(firstValue(params.next) ?? "/");
  const callbackFailed = firstValue(params.error) === "callback";

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand" aria-label="PRO7 Team Manager">
          <span aria-hidden="true">7</span>
          <div>
            <strong>PRO7</strong>
            <small>TEAM MANAGER</small>
          </div>
        </div>
        <div className="login-copy">
          <p>TRUNG TÂM ĐIỀU HÀNH ĐỘI BÓNG</p>
          <h1 id="login-title">Đăng nhập</h1>
          <span>Dùng tài khoản của bạn để tiếp tục quản lý đội bóng.</span>
        </div>
        <LoginForm
          next={next}
          initialError={
            callbackFailed
              ? "Liên kết đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng thử lại."
              : undefined
          }
        />
      </section>
      <p className="login-footnote">PRO7 Team Manager • Quản lý đội bóng 7 người</p>
    </main>
  );
}
