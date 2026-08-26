import type { Metadata } from "next";

import { isCanonicalProfileAvatarPath, type PreferredPosition, type ProfileRecord } from "../../../lib/account/profile";
import { requireProductUser } from "../../../lib/supabase/auth";
import { createServerSupabaseClient } from "../../../lib/supabase/server";
import { AccountMenu } from "../../components/account-menu";
import ProfileForm from "./profile-form";

export const metadata: Metadata = {
  title: "Hồ sơ cá nhân — PRO7 Team Manager",
};

type ProfilePageDependencies = {
  requireProductUser: (path: string) => Promise<{ user: { id: string; email?: string } }>;
  loadProfile: (
    userId: string,
  ) => Promise<{ ok: true; profile: ProfileRecord } | { ok: false }>;
  signAvatar: (path: string) => Promise<string | null>;
};

function initials(displayName: string | null, email?: string): string {
  const source = displayName || email?.split("@", 1)[0] || "PRO7";
  return source
    .split(/[\s._-]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("vi-VN"))
    .join("") || "P7";
}

export async function renderProfilePage(
  dependencies: ProfilePageDependencies,
): Promise<React.ReactNode> {
  const { user } = await dependencies.requireProductUser("/account/profile");
  const result = await dependencies.loadProfile(user.id);

  if (!result.ok) {
    return (
      <main className="account-profile-shell">
        <header className="account-profile-header">
          {/* Route shell uses native links so Vinext can own full-page auth redirects. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="account-profile-brand" href="/" aria-label="PRO7 Team Manager">
            <span aria-hidden="true">7</span><strong>PRO7</strong>
          </a>
          <AccountMenu email={user.email} />
        </header>
        <section className="account-profile-state" role="alert">
          <h1>Không thể tải hồ sơ</h1>
          <p>Vui lòng tải lại trang hoặc thử lại sau.</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">Quay lại đội bóng</a>
        </section>
      </main>
    );
  }

  const profile = result.profile;
  const avatarUrl = profile.avatarPath && isCanonicalProfileAvatarPath(profile.avatarPath, user.id)
    ? await dependencies.signAvatar(profile.avatarPath)
    : null;

  return (
    <main className="account-profile-shell">
      <header className="account-profile-header">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="account-profile-brand" href="/" aria-label="PRO7 Team Manager">
          <span aria-hidden="true">7</span><strong>PRO7</strong><small>TEAM MANAGER</small>
        </a>
        <AccountMenu email={user.email} />
      </header>
      <div className="account-profile-content">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="account-profile-back" href="/">← Quay lại đội bóng</a>
        <div className="account-profile-heading">
          <span>TÀI KHOẢN CÁ NHÂN</span>
          <h1>Hồ sơ cá nhân</h1>
          <p>Cập nhật thông tin, thể trạng, vị trí ưa thích và ảnh đại diện của bạn.</p>
        </div>
        <ProfileForm
          profile={profile}
          email={user.email ?? ""}
          avatarUrl={avatarUrl}
          initials={initials(profile.displayName, user.email)}
        />
      </div>
    </main>
  );
}

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  return renderProfilePage({
    requireProductUser,
    async loadProfile(userId) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,phone,date_of_birth,height_cm,weight_kg,preferred_positions,avatar_path")
        .eq("id", userId)
        .maybeSingle();
      if (error || !data) return { ok: false };
      const preferredPositions = data.preferred_positions.filter(
        (position): position is PreferredPosition =>
          position === "GK" || position === "DEF" || position === "MID" || position === "ATT",
      );
      return {
        ok: true,
        profile: {
          id: data.id,
          displayName: data.display_name,
          phone: data.phone,
          dateOfBirth: data.date_of_birth,
          heightCm: data.height_cm,
          weightKg: data.weight_kg,
          preferredPositions,
          avatarPath: data.avatar_path,
        },
      };
    },
    async signAvatar(path) {
      const { data, error } = await supabase.storage
        .from("player-avatars")
        .createSignedUrl(path, 300);
      return error ? null : data.signedUrl;
    },
  });
}
