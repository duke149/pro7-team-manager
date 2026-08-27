import { safeRelativeReturnPath } from "../supabase/return-path";

export const TEAM_RETURN_PATH_HEADER = "x-pro7-return-path";

export function safeTeamReturnPath(
  slug: string,
  requestedPath: string | null | undefined,
): string {
  const safePath = safeRelativeReturnPath(requestedPath ?? "/");
  let segments: string[];
  try {
    segments = new URL(safePath, "https://app.local").pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return "/";
  }

  return segments[0] === "teams" && segments[1] === slug ? safePath : "/";
}
