"use client";

import { FormEvent, useRef, useState } from "react";

import {
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  removeOwnAvatar,
  replaceOwnAvatar,
  validateAvatarFile,
  type AvatarClientDependencies,
} from "../../../lib/account/avatar";
import type { PreferredPosition, ProfileRecord } from "../../../lib/account/profile";
import { createBrowserSupabaseClient } from "../../../lib/supabase/client";

const POSITIONS: readonly PreferredPosition[] = ["GK", "DEF", "MID", "ATT"];
const GENERIC_ERROR = "Không thể cập nhật hồ sơ. Vui lòng thử lại.";

type FieldErrors = Record<string, string>;
type ApiPayload = {
  ok?: boolean;
  fieldErrors?: FieldErrors;
};

function numberOrNull(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

async function persistAvatarPath(path: string | null): Promise<{ ok: boolean }> {
  try {
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avatarPath: path }),
    });
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}

function browserAvatarDependencies(): AvatarClientDependencies {
  const supabase = createBrowserSupabaseClient();
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  return {
    async getCurrentUser() {
      const { data, error } = await supabase.auth.getUser();
      return error || !data.user ? null : { id: data.user.id };
    },
    async upload(path, file, options) {
      const { error } = await bucket.upload(path, file as File, options);
      return error ? { ok: false } : { ok: true };
    },
    async remove(paths) {
      const { error } = await bucket.remove(paths);
      return error ? { ok: false } : { ok: true };
    },
    persistAvatarPath,
  };
}

export default function ProfileForm({
  profile,
  email,
  avatarUrl,
  initials,
}: {
  profile: ProfileRecord;
  email: string;
  avatarUrl: string | null;
  initials: string;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth ?? "");
  const [heightCm, setHeightCm] = useState(profile.heightCm?.toString() ?? "");
  const [weightKg, setWeightKg] = useState(profile.weightKg?.toString() ?? "");
  const [preferredPositions, setPreferredPositions] = useState<PreferredPosition[]>(
    [...profile.preferredPositions],
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [profilePending, setProfilePending] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function togglePosition(position: PreferredPosition) {
    setPreferredPositions((current) => current.includes(position)
      ? current.filter((item) => item !== position)
      : [...current, position]);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setFieldErrors({});
    setProfilePending(true);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName,
          phone,
          dateOfBirth: dateOfBirth || null,
          heightCm: numberOrNull(heightCm),
          weightKg: numberOrNull(weightKg),
          preferredPositions,
        }),
      });
      const payload = await response.json().catch(() => ({})) as ApiPayload;
      if (!response.ok) {
        setFieldErrors(payload.fieldErrors ?? {});
        setMessage(response.status === 422 ? "Vui lòng kiểm tra lại thông tin." : GENERIC_ERROR);
        return;
      }
      setMessage("Đã lưu hồ sơ cá nhân.");
    } catch {
      setMessage(GENERIC_ERROR);
    } finally {
      setProfilePending(false);
    }
  }

  async function uploadAvatar(file: File) {
    setMessage("");
    const validation = validateAvatarFile(file);
    if (!validation.ok) {
      setMessage(validation.code === "type"
        ? "Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP."
        : validation.code === "size"
          ? "Ảnh đại diện không được vượt quá 3 MiB."
          : "Tệp ảnh không được để trống.");
      return;
    }

    setAvatarPending(true);
    try {
      const result = await replaceOwnAvatar(file, profile.avatarPath, browserAvatarDependencies());
      if (!result.ok) {
        setMessage(GENERIC_ERROR);
        return;
      }
      setMessage("Đã cập nhật ảnh đại diện.");
      window.location.reload();
    } catch {
      setMessage(GENERIC_ERROR);
    } finally {
      setAvatarPending(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeAvatar() {
    setMessage("");
    setAvatarPending(true);
    try {
      const result = await removeOwnAvatar(profile.avatarPath, browserAvatarDependencies());
      if (!result.ok) {
        setMessage(GENERIC_ERROR);
        return;
      }
      setMessage(result.cleanupPending
        ? "Đã gỡ ảnh đại diện; tệp cũ sẽ được dọn sau."
        : "Đã gỡ ảnh đại diện.");
      window.location.reload();
    } catch {
      setMessage(GENERIC_ERROR);
    } finally {
      setAvatarPending(false);
    }
  }

  return (
    <div className="account-profile-grid">
      <section className="account-profile-card account-avatar-card" aria-labelledby="avatar-title">
        <div className="account-avatar-preview" aria-label="Ảnh đại diện hiện tại">
          {avatarUrl
            ? <span className="account-avatar-photo" style={{ backgroundImage: `url(${JSON.stringify(avatarUrl).slice(1, -1)})` }} role="img" aria-label={`Ảnh đại diện của ${profile.displayName ?? email}`} />
            : <strong>{initials}</strong>}
        </div>
        <div>
          <span>ẢNH ĐẠI DIỆN</span>
          <h2 id="avatar-title">Hình ảnh cá nhân</h2>
          <p>JPEG, PNG hoặc WebP. Dung lượng tối đa {AVATAR_MAX_BYTES / 1024 / 1024} MiB.</p>
        </div>
        <div className="account-avatar-actions">
          <label className="primary-button" aria-disabled={avatarPending}>
            {avatarPending ? "Đang xử lý…" : "Tải ảnh lên"}
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={avatarPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAvatar(file);
              }}
            />
          </label>
          {profile.avatarPath && (
            <button className="danger-button" type="button" onClick={removeAvatar} disabled={avatarPending}>
              Gỡ ảnh
            </button>
          )}
        </div>
      </section>

      <form className="account-profile-card account-profile-form" onSubmit={saveProfile} aria-busy={profilePending}>
        <div className="account-profile-section-title">
          <span>THÔNG TIN CÁ NHÂN</span>
          <h2>Thông tin của bạn</h2>
        </div>
        <div className="account-profile-fields">
          <label>
            Tên hiển thị
            <input name="displayName" value={displayName} maxLength={100} onChange={(event) => setDisplayName(event.target.value)} aria-invalid={Boolean(fieldErrors.displayName)} />
            {fieldErrors.displayName && <small role="alert">{fieldErrors.displayName}</small>}
          </label>
          <label>
            Email
            <input value={email} readOnly disabled />
          </label>
          <label>
            Số điện thoại
            <input name="phone" type="tel" value={phone} maxLength={30} onChange={(event) => setPhone(event.target.value)} aria-invalid={Boolean(fieldErrors.phone)} />
            {fieldErrors.phone && <small role="alert">{fieldErrors.phone}</small>}
          </label>
          <label>
            Ngày sinh
            <input name="dateOfBirth" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} aria-invalid={Boolean(fieldErrors.dateOfBirth)} />
            {fieldErrors.dateOfBirth && <small role="alert">{fieldErrors.dateOfBirth}</small>}
          </label>
          <label>
            Chiều cao (cm)
            <input name="heightCm" type="number" min="100" max="250" step="1" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} aria-invalid={Boolean(fieldErrors.heightCm)} />
            {fieldErrors.heightCm && <small role="alert">{fieldErrors.heightCm}</small>}
          </label>
          <label>
            Cân nặng (kg)
            <input name="weightKg" type="number" min="30.01" max="300" step="0.01" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} aria-invalid={Boolean(fieldErrors.weightKg)} />
            {fieldErrors.weightKg && <small role="alert">{fieldErrors.weightKg}</small>}
          </label>
        </div>
        <fieldset className="account-position-fieldset">
          <legend>Vị trí ưa thích</legend>
          <div>
            {POSITIONS.map((position) => (
              <label key={position}>
                <input
                  type="checkbox"
                  name="preferredPositions"
                  value={position}
                  checked={preferredPositions.includes(position)}
                  onChange={() => togglePosition(position)}
                />
                <span>{position}</span>
              </label>
            ))}
          </div>
          {fieldErrors.preferredPositions && <small role="alert">{fieldErrors.preferredPositions}</small>}
        </fieldset>
        <p className={message.includes("Đã") ? "account-profile-message success" : "account-profile-message"} role="status" aria-live="polite">
          {message}
        </p>
        <button className="primary-button account-profile-submit" type="submit" disabled={profilePending || avatarPending}>
          {profilePending ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </form>
    </div>
  );
}
