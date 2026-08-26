export const SQUAD_POSITIONS = ["all", "GK", "DEF", "MID", "ATT"] as const;
export const SQUAD_STATUSES = [
  "active",
  "injured",
  "unavailable",
  "inactive",
] as const;
export const SQUAD_SORTS = [
  "name",
  "shirt_number",
  "position",
  "join_date",
  "status",
] as const;
export const SQUAD_DIRECTIONS = ["asc", "desc"] as const;

export type SquadPositionFilter = (typeof SQUAD_POSITIONS)[number];
export type SquadStatusFilter = (typeof SQUAD_STATUSES)[number];
export type SquadSort = (typeof SQUAD_SORTS)[number];
export type SquadDirection = (typeof SQUAD_DIRECTIONS)[number];

export type SquadFilters = Readonly<{
  q: string;
  searchPattern: string | null;
  position: SquadPositionFilter;
  status: SquadStatusFilter;
  sort: SquadSort;
  direction: SquadDirection;
}>;

type SearchParameters = Pick<URLSearchParams, "get">;

function isOneOf<const Values extends readonly string[]>(
  value: string | null,
  values: Values,
): value is Values[number] {
  return value !== null && values.includes(value);
}

function escapeIlike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export function parseSquadFilters(parameters: SearchParameters): SquadFilters {
  const rawQuery = parameters.get("q")?.trim() ?? "";
  const q = rawQuery.length <= 80 ? rawQuery : "";
  const requestedPosition = parameters.get("position");
  const requestedStatus = parameters.get("status");
  const requestedSort = parameters.get("sort");
  const requestedDirection = parameters.get("direction");

  const position = isOneOf(requestedPosition, SQUAD_POSITIONS)
    ? requestedPosition
    : "all";
  const status = isOneOf(requestedStatus, SQUAD_STATUSES)
    ? requestedStatus
    : "active";
  const sort = isOneOf(requestedSort, SQUAD_SORTS) ? requestedSort : "name";
  const direction = isOneOf(requestedDirection, SQUAD_DIRECTIONS)
    ? requestedDirection
    : sort === "join_date" && requestedSort === "join_date"
      ? "desc"
      : "asc";

  return Object.freeze({
    q,
    searchPattern: q ? `%${escapeIlike(q)}%` : null,
    position,
    status,
    sort,
    direction,
  });
}
