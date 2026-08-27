import type { Metadata } from "next";

import { requireProductUser } from "../../../lib/supabase/auth";
import TeamSetupForm from "./team-setup-form";

export const metadata: Metadata = {
  title: "Tạo đội đầu tiên — PRO7 Team Manager",
};

export default async function TeamSetupPage() {
  await requireProductUser("/setup/team");

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="team-setup-title">
        <div className="login-brand" aria-label="PRO7 Team Manager">
          <span aria-hidden="true">7</span>
          <div>
            <strong>PRO7</strong>
            <small>TEAM MANAGER</small>
          </div>
        </div>
        <div className="login-copy">
          <p>THIẾT LẬP ĐỘI BÓNG</p>
          <h1 id="team-setup-title">Tạo đội đầu tiên</h1>
          <span>Nhập tên đội để bắt đầu quản lý đội bóng của bạn.</span>
        </div>
        <TeamSetupForm />
      </section>
    </main>
  );
}
