const MAX_TEAM_SLUG_LENGTH = 48;
const RESERVED_TEAM_SLUGS = new Set(["setup", "account", "api", "login", "auth"]);

export type TeamSlugValidation =
  | { ok: true; slug: string }
  | { ok: false; code: "empty" | "reserved" | "length" };

export function normalizeTeamSlug(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("vi")
    .replace(/[đ]/gu, "d")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function validateTeamSlug(value: string): TeamSlugValidation {
  const slug = normalizeTeamSlug(value);
  if (!slug) return { ok: false, code: "empty" };
  if (slug.length > MAX_TEAM_SLUG_LENGTH) return { ok: false, code: "length" };
  if (RESERVED_TEAM_SLUGS.has(slug)) return { ok: false, code: "reserved" };
  return { ok: true, slug };
}
