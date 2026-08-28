const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const WEEKDAYS = [
  "CHỦ NHẬT",
  "THỨ HAI",
  "THỨ BA",
  "THỨ TƯ",
  "THỨ NĂM",
  "THỨ SÁU",
  "THỨ BẢY",
] as const;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export type VietnamDateTimeParts = Readonly<{
  day: string;
  month: string;
  year: string;
  time: string;
  weekday: string;
  long: string;
}>;

export function getVietnamDateTimeParts(value: string): VietnamDateTimeParts | null {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return null;
  const local = new Date(instant + VIETNAM_OFFSET_MS);
  const day = pad(local.getUTCDate());
  const month = pad(local.getUTCMonth() + 1);
  const year = local.getUTCFullYear().toString().padStart(4, "0");
  const time = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
  const weekday = WEEKDAYS[local.getUTCDay()] ?? "";
  return Object.freeze({
    day,
    month,
    year,
    time,
    weekday,
    long: `${time} · ${weekday}, ${day}/${month}/${year}`,
  });
}

export function formatVietnamMatchDateTime(value: string): string {
  return getVietnamDateTimeParts(value)?.long ?? "THỜI GIAN KHÔNG HỢP LỆ";
}

export function toVietnamDateTimeInput(value: string): string {
  const parts = getVietnamDateTimeParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.time}` : "";
}

export function fromVietnamDateTimeInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, 0, 0);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute
  ) return null;
  return new Date(local.valueOf() - VIETNAM_OFFSET_MS).toISOString();
}
