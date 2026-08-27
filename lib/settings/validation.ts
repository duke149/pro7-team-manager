type Mutation =
  | { action: "team"; name: string; slug: string }
  | { action: "notifications"; matchInvitations: boolean; matchReminders: boolean; reminderHoursBefore: number }
  | { action: "delete"; confirmation: string; slugConfirmation: string };

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]) { const actual = Object.keys(value).sort(); return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]); }

export function validateSettingsMutation(value: unknown): { ok: true; value: Mutation } | { ok: false; fieldErrors: Readonly<Record<string, string>> } {
  if (!record(value) || typeof value.action !== "string") return { ok: false, fieldErrors: {} };
  if (value.action === "team" && exact(value, ["action", "name", "slug"])) {
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const slug = typeof value.slug === "string" ? value.slug.trim() : "";
    const errors: Record<string, string> = {};
    if (name.length < 1 || name.length > 100) errors.name = "Tên đội phải có từ 1 đến 100 ký tự.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 63) errors.slug = "Slug chỉ gồm chữ thường, số và dấu gạch ngang.";
    return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true, value: { action: "team", name, slug } };
  }
  if (value.action === "notifications" && exact(value, ["action", "matchInvitations", "matchReminders", "reminderHoursBefore"])) {
    if (typeof value.matchInvitations === "boolean" && typeof value.matchReminders === "boolean" && Number.isInteger(value.reminderHoursBefore) && Number(value.reminderHoursBefore) >= 1 && Number(value.reminderHoursBefore) <= 168) return { ok: true, value: { action: "notifications", matchInvitations: value.matchInvitations, matchReminders: value.matchReminders, reminderHoursBefore: Number(value.reminderHoursBefore) } };
    return { ok: false, fieldErrors: { reminderHoursBefore: "Thời gian nhắc phải từ 1 đến 168 giờ." } };
  }
  if (value.action === "delete" && exact(value, ["action", "confirmation", "slugConfirmation"]) && typeof value.confirmation === "string" && typeof value.slugConfirmation === "string" && value.confirmation.length <= 100 && value.slugConfirmation.length <= 63) return { ok: true, value: { action: "delete", confirmation: value.confirmation, slugConfirmation: value.slugConfirmation } };
  return { ok: false, fieldErrors: {} };
}
