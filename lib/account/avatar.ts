export const AVATAR_BUCKET = "player-avatars";
export const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AvatarMime = keyof typeof EXTENSIONS;
export type AvatarFile = Readonly<{ type: string; size: number }>;
type OperationResult = { ok: true } | { ok: false };

export type AvatarClientDependencies = {
  getCurrentUser: () => Promise<{ id: string } | null>;
  upload: (
    path: string,
    file: AvatarFile,
    options: { upsert: true; contentType: string; cacheControl: "3600" },
  ) => Promise<OperationResult>;
  remove: (paths: string[]) => Promise<OperationResult>;
  persistAvatarPath: (path: string | null) => Promise<OperationResult>;
};

export type AvatarValidation =
  | { ok: true; extension: (typeof EXTENSIONS)[AvatarMime] }
  | { ok: false; code: "type" | "empty" | "size" };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export function validateAvatarFile(file: AvatarFile): AvatarValidation {
  if (!(file.type in EXTENSIONS)) return { ok: false, code: "type" };
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, code: "empty" };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, code: "size" };
  return { ok: true, extension: EXTENSIONS[file.type as AvatarMime] };
}

export function canonicalAvatarPath(userId: string, mime: AvatarMime): string {
  if (!isUuid(userId)) throw new Error("Invalid avatar owner.");
  return `${userId}/avatar.${EXTENSIONS[mime]}`;
}

export function isCanonicalOwnAvatarPath(path: string, userId: string): boolean {
  return isUuid(userId) && (
    path === `${userId}/avatar.jpg` ||
    path === `${userId}/avatar.png` ||
    path === `${userId}/avatar.webp`
  );
}

export async function replaceOwnAvatar(
  file: AvatarFile,
  currentAvatarPath: string | null,
  dependencies: AvatarClientDependencies,
): Promise<
  | { ok: true; path: string }
  | { ok: false; code: "validation" | "auth" | "upload" | "profile" }
> {
  const validation = validateAvatarFile(file);
  if (!validation.ok) return { ok: false, code: "validation" };

  const user = await dependencies.getCurrentUser();
  if (!user) return { ok: false, code: "auth" };
  let path: string;
  try {
    path = canonicalAvatarPath(user.id, file.type as AvatarMime);
  } catch {
    return { ok: false, code: "auth" };
  }

  const uploaded = await dependencies.upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (!uploaded.ok) return { ok: false, code: "upload" };

  if (currentAvatarPath === path) {
    return { ok: true, path };
  }

  const persisted = await dependencies.persistAvatarPath(path);
  if (!persisted.ok) {
    await dependencies.remove([path]);
    return { ok: false, code: "profile" };
  }

  if (
    currentAvatarPath &&
    currentAvatarPath !== path &&
    isCanonicalOwnAvatarPath(currentAvatarPath, user.id)
  ) {
    await dependencies.remove([currentAvatarPath]);
  }
  return { ok: true, path };
}

export async function removeOwnAvatar(
  currentAvatarPath: string | null,
  dependencies: AvatarClientDependencies,
): Promise<
  | { ok: true; cleanupPending?: true }
  | { ok: false; code: "auth" | "path" | "profile" }
> {
  const user = await dependencies.getCurrentUser();
  if (!user) return { ok: false, code: "auth" };
  if (!currentAvatarPath || !isCanonicalOwnAvatarPath(currentAvatarPath, user.id)) {
    return { ok: false, code: "path" };
  }

  const persisted = await dependencies.persistAvatarPath(null);
  if (!persisted.ok) return { ok: false, code: "profile" };
  const removed = await dependencies.remove([currentAvatarPath]);
  return removed.ok ? { ok: true } : { ok: true, cleanupPending: true };
}
