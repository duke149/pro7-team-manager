const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const USERNAME = /^[a-z0-9]{3,32}$/u;

export const PRO7_LOGIN_EMAIL_DOMAIN = "pro7.test";

export type LoginIdentifierResult =
  | {
      ok: true;
      authEmail: string;
      visibleIdentifier: string;
      kind: "email" | "username";
    }
  | { ok: false; code: "required" | "format" };

export function normalizeLoginIdentifier(input: unknown): LoginIdentifierResult {
  if (typeof input !== "string") return { ok: false, code: "required" };
  const visibleIdentifier = input.normalize("NFKC").trim();
  if (!visibleIdentifier) return { ok: false, code: "required" };

  const normalized = visibleIdentifier.toLocaleLowerCase("en-US");
  if (normalized.includes("@")) {
    return normalized.length <= 254 && EMAIL.test(normalized)
      ? { ok: true, authEmail: normalized, visibleIdentifier, kind: "email" }
      : { ok: false, code: "format" };
  }

  return USERNAME.test(normalized)
    ? {
        ok: true,
        authEmail: `${normalized}@${PRO7_LOGIN_EMAIL_DOMAIN}`,
        visibleIdentifier,
        kind: "username",
      }
    : { ok: false, code: "format" };
}
