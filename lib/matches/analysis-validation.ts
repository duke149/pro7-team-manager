import { isUuid } from "./model";
import { isIsoTimestamp } from "./validation";

export const MAX_ANALYSIS_EVENTS = 200;
export const MAX_ANALYSIS_PLAYER_STATS = 100;

const EVENT_TYPES = ["goal", "yellow_card", "red_card", "substitution", "note"] as const;
const TEAM_SIDES = ["team", "opponent"] as const;
const METRIC_KEYS = ["possession", "shots", "shotsOnTarget", "corners"] as const;

type EventType = (typeof EVENT_TYPES)[number];
type TeamSide = (typeof TEAM_SIDES)[number];
type FieldErrors = Readonly<Record<string, string>>;

export type MatchAnalysisRpcEvent = Readonly<{
  minute: number;
  sequence_no: number;
  event_type: EventType;
  team_side: TeamSide;
  player_user_id: string | null;
  secondary_user_id: string | null;
  note: string | null;
}>;

export type MatchAnalysisRpcPlayerStat = Readonly<{
  user_id: string;
  minutes_played: number;
  goals: number;
  assists: number;
  rating: number | null;
  is_mvp: boolean;
}>;

export type MatchAnalysisRpcMetric = Readonly<{ team: number; opponent: number }>;
export type MatchAnalysisRpcMetrics = Readonly<{
  possession?: MatchAnalysisRpcMetric;
  shots?: MatchAnalysisRpcMetric;
  shots_on_target?: MatchAnalysisRpcMetric;
  corners?: MatchAnalysisRpcMetric;
}>;

export type MatchAnalysisPayload = Readonly<{
  events: readonly MatchAnalysisRpcEvent[];
  playerStats: readonly MatchAnalysisRpcPlayerStat[];
  teamMetrics: MatchAnalysisRpcMetrics;
  expectedUpdatedAt: string;
}>;

type ValidationResult =
  | Readonly<{ ok: true; value: MatchAnalysisPayload }>
  | Readonly<{ ok: false; kind: "malformed" }>
  | Readonly<{ ok: false; kind: "validation"; fieldErrors: FieldErrors }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function normalizeOptionalText(value: unknown, maximum: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/gu, " ");
  const length = Array.from(normalized).length;
  return length >= 1 && length <= maximum ? normalized : undefined;
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function eventRelationshipIsValid(event: {
  eventType: EventType;
  teamSide: TeamSide;
  playerUserId: string | null;
  secondaryUserId: string | null;
  note: string | null;
}): boolean {
  if (event.teamSide === "opponent") {
    return event.playerUserId === null
      && event.secondaryUserId === null
      && (event.eventType !== "substitution" && event.eventType !== "note" || event.note !== null);
  }
  if (event.eventType === "goal") {
    return event.playerUserId !== null && event.secondaryUserId !== event.playerUserId;
  }
  if (event.eventType === "yellow_card" || event.eventType === "red_card") {
    return event.playerUserId !== null && event.secondaryUserId === null;
  }
  if (event.eventType === "substitution") {
    return event.playerUserId !== null && event.secondaryUserId !== null && event.secondaryUserId !== event.playerUserId;
  }
  return event.secondaryUserId === null && event.note !== null;
}

function parseEvent(value: unknown, index: number, errors: Record<string, string>): MatchAnalysisRpcEvent | null {
  const path = `events.${index}`;
  const keys = ["minute", "sequenceNo", "eventType", "teamSide", "playerUserId", "secondaryUserId", "note"];
  if (!isRecord(value) || !exactKeys(value, keys)) return null;
  const eventType = EVENT_TYPES.includes(value.eventType as EventType) ? value.eventType as EventType : null;
  const teamSide = TEAM_SIDES.includes(value.teamSide as TeamSide) ? value.teamSide as TeamSide : null;
  const note = normalizeOptionalText(value.note, 500);
  if (!isIntegerBetween(value.minute, 0, 120)) errors[`${path}.minute`] = "Phút thi đấu phải từ 0 đến 120.";
  if (!isIntegerBetween(value.sequenceNo, 1, 100)) errors[`${path}.sequenceNo`] = "Thứ tự sự kiện phải từ 1 đến 100.";
  if (!eventType) errors[`${path}.eventType`] = "Loại sự kiện không hợp lệ.";
  if (!teamSide) errors[`${path}.teamSide`] = "Phía ghi nhận sự kiện không hợp lệ.";
  if (!isNullableUuid(value.playerUserId)) errors[`${path}.playerUserId`] = "Cầu thủ không hợp lệ.";
  if (!isNullableUuid(value.secondaryUserId)) errors[`${path}.secondaryUserId`] = "Cầu thủ liên quan không hợp lệ.";
  if (note === undefined) errors[`${path}.note`] = "Ghi chú phải từ 1 đến 500 ký tự hoặc để trống.";
  if (Object.keys(errors).some((key) => key.startsWith(`${path}.`))) return null;
  const parsed = {
    eventType: eventType as EventType,
    teamSide: teamSide as TeamSide,
    playerUserId: value.playerUserId as string | null,
    secondaryUserId: value.secondaryUserId as string | null,
    note: note as string | null,
  };
  if (!eventRelationshipIsValid(parsed)) {
    errors[path] = "Quan hệ cầu thủ và loại sự kiện không hợp lệ.";
    return null;
  }
  return Object.freeze({
    minute: value.minute as number,
    sequence_no: value.sequenceNo as number,
    event_type: parsed.eventType,
    team_side: parsed.teamSide,
    player_user_id: parsed.playerUserId,
    secondary_user_id: parsed.secondaryUserId,
    note: parsed.note,
  });
}

function parsePlayerStat(value: unknown, index: number, errors: Record<string, string>): MatchAnalysisRpcPlayerStat | null {
  const path = `playerStats.${index}`;
  const keys = ["userId", "minutesPlayed", "goals", "assists", "rating", "isMvp"];
  if (!isRecord(value) || !exactKeys(value, keys)) return null;
  if (!isUuid(value.userId)) errors[`${path}.userId`] = "Cầu thủ không hợp lệ.";
  if (!isIntegerBetween(value.minutesPlayed, 0, 120)) errors[`${path}.minutesPlayed`] = "Số phút phải từ 0 đến 120.";
  if (!isIntegerBetween(value.goals, 0, 32767)) errors[`${path}.goals`] = "Số bàn thắng không hợp lệ.";
  if (!isIntegerBetween(value.assists, 0, 32767)) errors[`${path}.assists`] = "Số kiến tạo không hợp lệ.";
  const ratingValid = value.rating === null
    || typeof value.rating === "number" && Number.isFinite(value.rating) && value.rating >= 0 && value.rating <= 10
      && Math.abs(value.rating * 10 - Math.round(value.rating * 10)) < 1e-9;
  if (!ratingValid) errors[`${path}.rating`] = "Điểm phải từ 0 đến 10 và có tối đa một chữ số thập phân.";
  if (typeof value.isMvp !== "boolean") errors[`${path}.isMvp`] = "Trạng thái MVP không hợp lệ.";
  if (Object.keys(errors).some((key) => key.startsWith(`${path}.`))) return null;
  return Object.freeze({
    user_id: value.userId as string,
    minutes_played: value.minutesPlayed as number,
    goals: value.goals as number,
    assists: value.assists as number,
    rating: value.rating as number | null,
    is_mvp: value.isMvp as boolean,
  });
}

function parseMetric(value: unknown, path: string, maximum: number, errors: Record<string, string>): MatchAnalysisRpcMetric | null {
  if (!isRecord(value) || !exactKeys(value, ["team", "opponent"])) return null;
  if (!isIntegerBetween(value.team, 0, maximum)) errors[`${path}.team`] = "Chỉ số đội không hợp lệ.";
  if (!isIntegerBetween(value.opponent, 0, maximum)) errors[`${path}.opponent`] = "Chỉ số đối thủ không hợp lệ.";
  if (Object.keys(errors).some((key) => key.startsWith(`${path}.`))) return null;
  return Object.freeze({ team: value.team as number, opponent: value.opponent as number });
}

function parseMetrics(value: unknown, errors: Record<string, string>): MatchAnalysisRpcMetrics | null {
  if (!isRecord(value) || !Object.keys(value).every((key) => METRIC_KEYS.includes(key as (typeof METRIC_KEYS)[number]))) return null;
  const parsed: {
    possession?: MatchAnalysisRpcMetric;
    shots?: MatchAnalysisRpcMetric;
    shots_on_target?: MatchAnalysisRpcMetric;
    corners?: MatchAnalysisRpcMetric;
  } = {};
  for (const key of METRIC_KEYS) {
    if (!(key in value)) continue;
    const metric = parseMetric(value[key], `teamMetrics.${key}`, key === "possession" ? 100 : 32767, errors);
    if (!metric) return null;
    if (key === "shotsOnTarget") parsed.shots_on_target = metric;
    else parsed[key] = metric;
  }
  if (parsed.possession && parsed.possession.team + parsed.possession.opponent !== 100) {
    errors["teamMetrics.possession"] = "Tổng kiểm soát bóng phải bằng 100%.";
  }
  if (parsed.shots && parsed.shots_on_target && (parsed.shots_on_target.team > parsed.shots.team || parsed.shots_on_target.opponent > parsed.shots.opponent)) {
    errors["teamMetrics.shotsOnTarget"] = "Số cú sút trúng đích không thể lớn hơn tổng cú sút.";
  }
  return Object.freeze(parsed);
}

export function validateMatchAnalysisPayload(value: unknown): ValidationResult {
  if (!isRecord(value) || !exactKeys(value, ["events", "playerStats", "teamMetrics", "expectedUpdatedAt"])) {
    return { ok: false, kind: "malformed" };
  }
  if (!Array.isArray(value.events) || !Array.isArray(value.playerStats) || !isRecord(value.teamMetrics)) {
    return { ok: false, kind: "malformed" };
  }
  if (value.events.some((event) => !isRecord(event) || !exactKeys(event, ["minute", "sequenceNo", "eventType", "teamSide", "playerUserId", "secondaryUserId", "note"]))) {
    return { ok: false, kind: "malformed" };
  }
  if (value.playerStats.some((stat) => !isRecord(stat) || !exactKeys(stat, ["userId", "minutesPlayed", "goals", "assists", "rating", "isMvp"]))) {
    return { ok: false, kind: "malformed" };
  }
  if (!Object.keys(value.teamMetrics).every((key) => METRIC_KEYS.includes(key as (typeof METRIC_KEYS)[number]))) {
    return { ok: false, kind: "malformed" };
  }
  for (const metric of Object.values(value.teamMetrics)) {
    if (!isRecord(metric) || !exactKeys(metric, ["team", "opponent"])) return { ok: false, kind: "malformed" };
  }

  const errors: Record<string, string> = {};
  if (value.events.length > MAX_ANALYSIS_EVENTS) errors.events = `Tối đa ${MAX_ANALYSIS_EVENTS} sự kiện.`;
  if (value.playerStats.length > MAX_ANALYSIS_PLAYER_STATS) errors.playerStats = `Tối đa ${MAX_ANALYSIS_PLAYER_STATS} cầu thủ.`;
  if (!isIsoTimestamp(value.expectedUpdatedAt)) errors.expectedUpdatedAt = "Phiên bản trận đấu không hợp lệ.";

  const events = value.events.slice(0, MAX_ANALYSIS_EVENTS).map((event, index) => parseEvent(event, index, errors));
  const stats = value.playerStats.slice(0, MAX_ANALYSIS_PLAYER_STATS).map((stat, index) => parsePlayerStat(stat, index, errors));
  const metrics = parseMetrics(value.teamMetrics, errors);

  const eventOrders = events.filter((event): event is MatchAnalysisRpcEvent => event !== null).map((event) => `${event.minute}:${event.sequence_no}`);
  if (new Set(eventOrders).size !== eventOrders.length) errors.events = "Mỗi phút và thứ tự chỉ được dùng một lần.";
  const playerIds = stats.filter((stat): stat is MatchAnalysisRpcPlayerStat => stat !== null).map((stat) => stat.user_id);
  if (new Set(playerIds).size !== playerIds.length) errors.playerStats = "Mỗi cầu thủ chỉ được ghi nhận một lần.";
  if (stats.filter((stat) => stat?.is_mvp).length > 1) errors.playerStats = "Chỉ được chọn một cầu thủ MVP.";

  if (Object.keys(errors).length > 0 || events.some((event) => event === null) || stats.some((stat) => stat === null) || metrics === null) {
    return { ok: false, kind: "validation", fieldErrors: Object.freeze(errors) };
  }
  return {
    ok: true,
    value: Object.freeze({
      events: Object.freeze(events as MatchAnalysisRpcEvent[]),
      playerStats: Object.freeze(stats as MatchAnalysisRpcPlayerStat[]),
      teamMetrics: metrics,
      expectedUpdatedAt: value.expectedUpdatedAt as string,
    }),
  };
}
