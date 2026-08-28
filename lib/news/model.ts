import { isUuid } from "../matches/model";
import { isIsoTimestamp } from "../matches/validation";

export type TeamNewsStatus = "draft" | "published" | "archived";

export type ManagedTeamNewsPost = Readonly<{
  id: string;
  title: string;
  body: string;
  status: TeamNewsStatus;
  publishedAt: string | null;
  updatedAt: string;
}>;

export type TeamNewsMutationResult =
  | Readonly<{ ok: true; post: ManagedTeamNewsPost }>
  | Readonly<{ ok: false; error: "server" }>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function parsedFields(value: Record<string, unknown>, publishedAtKey: "published_at" | "publishedAt", updatedAtKey: "updated_at" | "updatedAt"): ManagedTeamNewsPost | null {
  const id = value.id;
  const title = value.title;
  const body = value.body;
  const status = value.status;
  const publishedAt = value[publishedAtKey];
  const updatedAt = value[updatedAtKey];
  if (!isUuid(id)
    || typeof title !== "string" || title.trim() !== title || Array.from(title).length < 1 || Array.from(title).length > 160
    || typeof body !== "string" || body.trim() !== body || Array.from(body).length < 1 || Array.from(body).length > 5000
    || (status !== "draft" && status !== "published" && status !== "archived")
    || !(publishedAt === null || isIsoTimestamp(publishedAt))
    || !isIsoTimestamp(updatedAt)
    || (status === "draft" && publishedAt !== null)
    || (status === "published" && publishedAt === null)) return null;
  return Object.freeze({ id, title, body, status, publishedAt, updatedAt });
}

export function parseManagedTeamNewsPost(value: unknown): ManagedTeamNewsPost | null {
  if (!record(value)) return null;
  return parsedFields(value, "published_at", "updated_at");
}

export function parseManagedTeamNewsResponse(value: unknown): ManagedTeamNewsPost | null {
  if (!record(value) || !exactKeys(value, ["ok", "post"]) || value.ok !== true || !record(value.post)
    || !exactKeys(value.post, ["id", "title", "body", "status", "publishedAt", "updatedAt"])) return null;
  return parsedFields(value.post, "publishedAt", "updatedAt");
}
