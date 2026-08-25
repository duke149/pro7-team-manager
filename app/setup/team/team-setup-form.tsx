"use client";

import { FormEvent, useState } from "react";

const GENERIC_ERROR = "Không thể tạo đội. Vui lòng thử lại.";

type TeamResponse = { team?: { slug?: string }; code?: string };

export default function TeamSetupForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(slug.trim() ? { name, slug } : { name }),
      });
      const payload = (await response.json().catch(() => null)) as TeamResponse | null;

      if (response.status === 201 && typeof payload?.team?.slug === "string") {
        window.location.assign(`/teams/${encodeURIComponent(payload.team.slug)}/overview`);
        return;
      }

      setErrorMessage(
        payload?.code === "duplicate"
          ? "Đường dẫn đội này đã được sử dụng."
          : payload?.code === "validation"
            ? "Tên đội hoặc đường dẫn đội không hợp lệ."
            : GENERIC_ERROR,
      );
    } catch {
      setErrorMessage(GENERIC_ERROR);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label htmlFor="team-name">Tên đội</label>
      <input
        id="team-name"
        name="name"
        type="text"
        autoComplete="organization"
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={isLoading}
        maxLength={100}
        required
      />

      <label htmlFor="team-slug">Đường dẫn đội (không bắt buộc)</label>
      <input
        id="team-slug"
        name="slug"
        type="text"
        autoComplete="off"
        value={slug}
        onChange={(event) => setSlug(event.target.value)}
        disabled={isLoading}
        maxLength={100}
      />

      <p className="login-error" role="alert" aria-live="polite">
        {errorMessage}
      </p>

      <button type="submit" disabled={isLoading} aria-busy={isLoading}>
        {isLoading ? "Đang tạo đội…" : "Tạo đội"}
      </button>
    </form>
  );
}
