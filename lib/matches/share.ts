import { formatVietnamMatchDateTime } from "./date-time";
import { isUuid } from "./model";

const TEAM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_TEAM_SLUG_LENGTH = 48;

export type MatchShareInput = Readonly<{
  origin: string;
  slug: string;
  matchId: string;
  teamName: string;
  opponent: string;
  startsAt: string;
  venue: string | null;
}>;

export type MatchSharePayload = Readonly<{
  title: string;
  text: string;
  url: string;
}>;

function validSlug(value: string): boolean {
  return value.length <= MAX_TEAM_SLUG_LENGTH && TEAM_SLUG.test(value);
}
function boundedText(value: string, maximum: number): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > maximum) throw new TypeError("Invalid match share field");
  return normalized;
}

function canonicalOrigin(value: string): string {
  const parsed = new URL(value);
  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
  ) throw new TypeError("Invalid application origin");
  return parsed.origin;
}

export function canonicalMatchRsvpPath(slug: string, matchId: string): string {
  if (!validSlug(slug) || !isUuid(matchId)) throw new TypeError("Invalid match identity");
  return `/teams/${slug}/matches/${matchId}/rsvp`;
}

export function canonicalMatchRsvpUrl(origin: string, slug: string, matchId: string): string {
  return `${canonicalOrigin(origin)}${canonicalMatchRsvpPath(slug, matchId)}`;
}

export function buildMatchSharePayload(input: MatchShareInput): MatchSharePayload {
  const teamName = boundedText(input.teamName, 120);
  const opponent = boundedText(input.opponent, 120);
  const venue = input.venue === null ? "Chưa cập nhật địa điểm" : boundedText(input.venue, 200);
  const when = formatVietnamMatchDateTime(input.startsAt);
  if (when === "THỜI GIAN KHÔNG HỢP LỆ") throw new TypeError("Invalid match time");
  return Object.freeze({
    title: `${teamName} mời bạn xác nhận trận đấu`,
    text: `${teamName} vs ${opponent} · ${when} · ${venue}`,
    url: canonicalMatchRsvpUrl(input.origin, input.slug, input.matchId),
  });
}
