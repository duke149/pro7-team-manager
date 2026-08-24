const LOCAL_ORIGIN = "https://app.local";
const RESERVED_AUTH_PATHS = [
  "/login",
  "/auth/callback",
  "/signin-with-chatgpt",
  "/signout-with-chatgpt",
  "/callback",
] as const;

function containsUnsafeCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return character === "\\" || codePoint <= 31 || codePoint === 127;
  });
}

function validatedRelativeReturnPath(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (containsUnsafeCharacter(value)) return null;

  let decodedValue: string;
  let url: URL;
  try {
    decodedValue = decodeURIComponent(value);
    url = new URL(value, LOCAL_ORIGIN);
  } catch {
    return null;
  }

  if (containsUnsafeCharacter(decodedValue)) return null;
  if (url.origin !== LOCAL_ORIGIN) return null;

  const decodedPathname = decodeURIComponent(url.pathname);
  const normalizedPathname = decodedPathname.replace(/\/+$/u, "") || "/";
  const isReserved = RESERVED_AUTH_PATHS.some(
    (path) =>
      normalizedPathname === path || normalizedPathname.startsWith(`${path}/`),
  );
  if (isReserved) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

export function safeRelativeReturnPath(value: string, fallback = "/"): string {
  return (
    validatedRelativeReturnPath(value) ??
    validatedRelativeReturnPath(fallback) ??
    "/"
  );
}
