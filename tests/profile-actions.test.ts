import assert from "node:assert/strict";
import test from "node:test";

import {
  updateOwnProfile,
  validateProfilePatch,
  type OwnProfileUpdate,
  type ProfileActionDependencies,
} from "../lib/account/profile";
import {
  AVATAR_MAX_BYTES,
  canonicalAvatarPath,
  isCanonicalOwnAvatarPath,
  removeOwnAvatar,
  replaceOwnAvatar,
  validateAvatarFile,
  type AvatarClientDependencies,
} from "../lib/account/avatar";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://pro7.example/api/account/profile", {
    method: "PATCH",
    headers: {
      "content-type": "application/json; charset=utf-8",
      origin: "https://pro7.example",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function profileDependencies({
  authenticated = true,
  databaseError = false,
}: {
  authenticated?: boolean;
  databaseError?: boolean;
} = {}) {
  const updates: Array<{ userId: string; patch: OwnProfileUpdate }> = [];
  let authCalls = 0;
  const value: ProfileActionDependencies = {
    now: () => new Date("2026-08-26T00:00:00.000Z"),
    async getCurrentUser() {
      authCalls += 1;
      return authenticated ? { id: USER_ID } : null;
    },
    async updateProfile(userId, patch) {
      updates.push({ userId, patch });
      return databaseError ? { ok: false as const } : { ok: true as const };
    },
  };
  return { value, updates, authCalls: () => authCalls };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test("profile validation normalizes allowed personal fields and keeps explicit null clears", () => {
  const result = validateProfilePatch({
    displayName: "  Nguyễn An  ",
    phone: " 090 123 4567 ",
    dateOfBirth: null,
    heightCm: 175,
    weightKg: 68.5,
    preferredPositions: ["MID", "ATT"],
    avatarPath: null,
  }, USER_ID, new Date("2026-08-26T00:00:00.000Z"));

  assert.deepEqual(result, {
    ok: true,
    value: {
      display_name: "Nguyễn An",
      phone: "090 123 4567",
      date_of_birth: null,
      height_cm: 175,
      weight_kg: 68.5,
      preferred_positions: ["MID", "ATT"],
      avatar_path: null,
    },
  });
});

test("profile validation rejects unknown or target-user fields instead of silently dropping them", () => {
  for (const payload of [
    { displayName: "Nguyễn An", userId: OTHER_USER_ID },
    { displayName: "Nguyễn An", roleId: "admin" },
    {},
  ]) {
    assert.deepEqual(
      validateProfilePatch(payload, USER_ID, new Date("2026-08-26T00:00:00.000Z")),
      { ok: false, kind: "malformed" },
    );
  }
});

test("profile validation enforces database-aligned field bounds and unique positions", () => {
  const cases: Array<{ field: string; value: unknown; message: string }> = [
    { field: "displayName", value: "x".repeat(101), message: "Tên hiển thị tối đa 100 ký tự." },
    { field: "phone", value: "1".repeat(31), message: "Số điện thoại tối đa 30 ký tự." },
    { field: "dateOfBirth", value: "2026-08-27", message: "Ngày sinh không được ở tương lai." },
    { field: "dateOfBirth", value: "2026-02-30", message: "Ngày sinh không hợp lệ." },
    { field: "heightCm", value: 99, message: "Chiều cao phải từ 100 đến 250 cm." },
    { field: "heightCm", value: 175.5, message: "Chiều cao phải là số nguyên từ 100 đến 250 cm." },
    { field: "weightKg", value: 30, message: "Cân nặng phải lớn hơn 30, không quá 300 kg và có tối đa 2 chữ số thập phân." },
    { field: "weightKg", value: 301, message: "Cân nặng phải lớn hơn 30, không quá 300 kg và có tối đa 2 chữ số thập phân." },
    { field: "preferredPositions", value: ["MID", "MID"], message: "Mỗi vị trí chỉ được chọn một lần." },
    { field: "preferredPositions", value: ["COACH"], message: "Vị trí ưa thích không hợp lệ." },
    { field: "avatarPath", value: `${OTHER_USER_ID}/avatar.png`, message: "Đường dẫn ảnh đại diện không hợp lệ." },
  ];

  for (const fixture of cases) {
    const result = validateProfilePatch(
      { [fixture.field]: fixture.value },
      USER_ID,
      new Date("2026-08-26T00:00:00.000Z"),
    );
    assert.deepEqual(result, {
      ok: false,
      kind: "validation",
      fieldErrors: { [fixture.field]: fixture.message },
    }, fixture.field);
  }
});

test("profile weight validation rejects values outside numeric(5,2) precision without narrowing valid boundaries", () => {
  for (const weightKg of [30.001, 68.555]) {
    assert.deepEqual(
      validateProfilePatch({ weightKg }, USER_ID, new Date("2026-08-26T00:00:00.000Z")),
      {
        ok: false,
        kind: "validation",
        fieldErrors: {
          weightKg: "Cân nặng phải lớn hơn 30, không quá 300 kg và có tối đa 2 chữ số thập phân.",
        },
      },
    );
  }

  for (const weightKg of [30.01, 68.55, 300]) {
    assert.deepEqual(
      validateProfilePatch({ weightKg }, USER_ID, new Date("2026-08-26T00:00:00.000Z")),
      { ok: true, value: { weight_kg: weightKg } },
    );
  }
});

test("own-profile action rejects cross-origin and non-JSON requests before identity or database work", async () => {
  for (const headers of [
    { origin: "https://attacker.example" },
    { "content-type": "text/plain" },
  ]) {
    const fixture = profileDependencies();
    const response = await updateOwnProfile(request({ displayName: "Nguyễn An" }, headers), fixture.value);
    assert.equal(response.status, headers.origin ? 403 : 415);
    assert.equal(fixture.authCalls(), 0);
    assert.deepEqual(fixture.updates, []);
  }
});

test("own-profile action derives the update target only from verified identity", async () => {
  const fixture = profileDependencies();
  const response = await updateOwnProfile(request({ displayName: " Nguyễn An ", phone: "" }), fixture.value);

  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), { ok: true });
  assert.deepEqual(fixture.updates, [{
    userId: USER_ID,
    patch: { display_name: "Nguyễn An", phone: null },
  }]);
});

test("own-profile action fails closed for missing identity, malformed keys, validation, and database errors", async () => {
  const unauthenticated = profileDependencies({ authenticated: false });
  assert.equal((await updateOwnProfile(request({ displayName: "An" }), unauthenticated.value)).status, 401);

  const forged = profileDependencies();
  assert.equal((await updateOwnProfile(request({ displayName: "An", userId: OTHER_USER_ID }), forged.value)).status, 400);
  assert.deepEqual(forged.updates, []);

  const invalid = profileDependencies();
  const invalidResponse = await updateOwnProfile(request({ heightCm: 99 }), invalid.value);
  assert.equal(invalidResponse.status, 422);
  assert.deepEqual(await json(invalidResponse), {
    ok: false,
    code: "validation",
    message: "Vui lòng kiểm tra lại hồ sơ.",
    fieldErrors: { heightCm: "Chiều cao phải từ 100 đến 250 cm." },
  });

  const failed = profileDependencies({ databaseError: true });
  assert.equal((await updateOwnProfile(request({ displayName: "An" }), failed.value)).status, 500);
});

test("avatar validation enforces exact MIME types, positive size, and the 3 MiB boundary", () => {
  for (const [type, extension] of [
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ] as const) {
    assert.deepEqual(validateAvatarFile({ type, size: AVATAR_MAX_BYTES }), { ok: true, extension });
  }
  assert.deepEqual(validateAvatarFile({ type: "image/gif", size: 10 }), { ok: false, code: "type" });
  assert.deepEqual(validateAvatarFile({ type: "image/png", size: 0 }), { ok: false, code: "empty" });
  assert.deepEqual(validateAvatarFile({ type: "image/png", size: AVATAR_MAX_BYTES + 1 }), { ok: false, code: "size" });
});

test("avatar validation rejects inherited object keys that are not exact MIME entries", () => {
  for (const type of ["toString", "constructor", "__proto__"]) {
    assert.deepEqual(validateAvatarFile({ type, size: 1024 }), { ok: false, code: "type" });
  }
});

test("canonical avatar paths are owner-only and never use a client-provided file name", () => {
  assert.equal(canonicalAvatarPath(USER_ID, "image/jpeg"), `${USER_ID}/avatar.jpg`);
  assert.equal(canonicalAvatarPath(USER_ID, "image/png"), `${USER_ID}/avatar.png`);
  assert.equal(canonicalAvatarPath(USER_ID, "image/webp"), `${USER_ID}/avatar.webp`);
  assert.equal(isCanonicalOwnAvatarPath(`${USER_ID}/avatar.webp`, USER_ID), true);
  assert.equal(isCanonicalOwnAvatarPath(`${USER_ID}/portrait.webp`, USER_ID), false);
  assert.equal(isCanonicalOwnAvatarPath(`${OTHER_USER_ID}/avatar.webp`, USER_ID), false);
  assert.equal(isCanonicalOwnAvatarPath(`${USER_ID}/avatar.svg`, USER_ID), false);
});

function avatarDependencies({ persistFails = false, uploadFails = false } = {}) {
  const objects = new Map<string, { type: string; size: number }>();
  const persisted: Array<string | null> = [];
  const removed: string[][] = [];
  let authCalls = 0;
  const value: AvatarClientDependencies = {
    async getCurrentUser() {
      authCalls += 1;
      return { id: USER_ID };
    },
    async upload(path, file, options) {
      assert.deepEqual(options, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (uploadFails) return { ok: false as const };
      objects.set(path, { type: file.type, size: file.size });
      return { ok: true as const };
    },
    async remove(paths) {
      removed.push(paths);
      for (const path of paths) objects.delete(path);
      return { ok: true as const };
    },
    async persistAvatarPath(path) {
      persisted.push(path);
      return persistFails ? { ok: false as const } : { ok: true as const };
    },
  };
  return { value, objects, persisted, removed, authCalls: () => authCalls };
}

test("avatar replacement authenticates first, stores only the canonical owner object, and persists that path", async () => {
  const fixture = avatarDependencies();
  const file = { type: "image/png", size: 1024 };
  const result = await replaceOwnAvatar(file, `${USER_ID}/avatar.jpg`, fixture.value);

  assert.deepEqual(result, { ok: true, path: `${USER_ID}/avatar.png` });
  assert.equal(fixture.authCalls(), 1);
  assert.deepEqual([...fixture.objects], [[`${USER_ID}/avatar.png`, { type: "image/png", size: 1024 }]]);
  assert.deepEqual(fixture.persisted, [`${USER_ID}/avatar.png`]);
  assert.deepEqual(fixture.removed, [[`${USER_ID}/avatar.jpg`]]);
});

test("avatar replacement never removes a forged foreign path and cleans a new object when profile persistence fails", async () => {
  const fixture = avatarDependencies({ persistFails: true });
  const result = await replaceOwnAvatar(
    { type: "image/webp", size: 1024 },
    `${OTHER_USER_ID}/avatar.jpg`,
    fixture.value,
  );

  assert.deepEqual(result, { ok: false, code: "profile" });
  assert.deepEqual(fixture.removed, [[`${USER_ID}/avatar.webp`]]);
  assert.deepEqual([...fixture.objects], []);
});

test("same-extension avatar replacement does not delete the live object when its profile path is already canonical", async () => {
  const fixture = avatarDependencies({ persistFails: true });
  const result = await replaceOwnAvatar(
    { type: "image/png", size: 2048 },
    `${USER_ID}/avatar.png`,
    fixture.value,
  );

  assert.deepEqual(result, { ok: true, path: `${USER_ID}/avatar.png` });
  assert.deepEqual(fixture.persisted, []);
  assert.deepEqual(fixture.removed, []);
  assert.deepEqual([...fixture.objects], [[`${USER_ID}/avatar.png`, { type: "image/png", size: 2048 }]]);
});

test("avatar removal rejects non-owner paths without storage or profile changes", async () => {
  const fixture = avatarDependencies();
  const result = await removeOwnAvatar(`${OTHER_USER_ID}/avatar.png`, fixture.value);

  assert.deepEqual(result, { ok: false, code: "path" });
  assert.deepEqual(fixture.persisted, []);
  assert.deepEqual(fixture.removed, []);
});

test("avatar removal clears the own profile before deleting its private object", async () => {
  const fixture = avatarDependencies();
  const result = await removeOwnAvatar(`${USER_ID}/avatar.jpg`, fixture.value);

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(fixture.persisted, [null]);
  assert.deepEqual(fixture.removed, [[`${USER_ID}/avatar.jpg`]]);
});
