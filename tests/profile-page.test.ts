import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

import { AccountMenu } from "../app/components/account-menu";
import type { ProfileRecord } from "../lib/account/profile";

type PageModule = {
  renderProfilePage(args: {
    requireProductUser: (path: string) => Promise<{ user: { id: string; email?: string } }>;
    loadProfile: (userId: string) => Promise<{ ok: true; profile: ProfileRecord } | { ok: false }>;
    signAvatar: (path: string) => Promise<string | null>;
  }): Promise<unknown>;
};

const USER_ID = "00000000-0000-4000-8000-000000000001";
const PROFILE: ProfileRecord = {
  id: USER_ID,
  displayName: "Nguyễn An",
  phone: "0901234567",
  dateOfBirth: "2000-05-10",
  heightCm: 175,
  weightKg: 68.5,
  preferredPositions: ["MID", "ATT"],
  avatarPath: `${USER_ID}/avatar.webp`,
};

let vite: ViteDevServer;
let page: PageModule;

test.before(async () => {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    resolve: {
      alias: {
        "next/navigation": resolve("tests/fixtures/squad-page-navigation.ts"),
        "next/headers": resolve("node_modules/vinext/dist/shims/headers.js"),
      },
    },
    server: { middlewareMode: true },
  });
  page = await vite.ssrLoadModule("/app/account/profile/page.tsx") as PageModule;
});

test.after(async () => vite.close());

function html(element: unknown): string {
  return renderToStaticMarkup(element as React.ReactElement);
}

test("profile page loads only the verified caller row and signs only its canonical private avatar", async () => {
  const loaded: string[] = [];
  const signed: string[] = [];
  const output = await page.renderProfilePage({
    async requireProductUser(path) {
      assert.equal(path, "/account/profile");
      return { user: { id: USER_ID, email: "an@example.com" } };
    },
    async loadProfile(userId) {
      loaded.push(userId);
      return { ok: true, profile: PROFILE };
    },
    async signAvatar(path) {
      signed.push(path);
      return "https://signed.example/avatar.webp?token=short-lived";
    },
  });
  const markup = html(output);

  assert.deepEqual(loaded, [USER_ID]);
  assert.deepEqual(signed, [`${USER_ID}/avatar.webp`]);
  assert.match(markup, /class="account-profile-shell light"/u);
  assert.match(markup, /class="theme-button"[^>]*aria-pressed="false"[^>]*aria-label="Bật giao diện tối"/u);
  assert.match(markup, /Hồ sơ cá nhân/u);
  assert.match(markup, /Nguyễn An/u);
  assert.match(markup, /0901234567/u);
  assert.match(markup, /<input[^>]*checked[^>]*value="MID"/u);
  assert.match(markup, /<input[^>]*checked[^>]*value="ATT"/u);
  assert.match(markup, /signed\.example\/avatar\.webp\?token=short-lived/u);
  assert.doesNotMatch(markup, /service_role|SUPABASE_SERVICE_ROLE_KEY/u);
});

test("profile page refuses to sign a non-canonical avatar and renders the initials fallback", async () => {
  let signCalls = 0;
  const output = await page.renderProfilePage({
    requireProductUser: async () => ({ user: { id: USER_ID, email: "an@example.com" } }),
    loadProfile: async () => ({
      ok: true,
      profile: { ...PROFILE, avatarPath: `00000000-0000-4000-8000-000000000002/avatar.webp` },
    }),
    signAvatar: async () => {
      signCalls += 1;
      return "https://must-not-be-used.example";
    },
  });
  const markup = html(output);

  assert.equal(signCalls, 0);
  assert.match(markup, />NA</u);
  assert.doesNotMatch(markup, /must-not-be-used/u);
});

test("profile page keeps an honest load-error state without rendering editable values", async () => {
  const output = await page.renderProfilePage({
    requireProductUser: async () => ({ user: { id: USER_ID, email: "an@example.com" } }),
    loadProfile: async () => ({ ok: false }),
    signAvatar: async () => null,
  });
  const markup = html(output);

  assert.match(markup, /Không thể tải hồ sơ/u);
  assert.doesNotMatch(markup, /name="displayName"/u);
});

test("account menu exposes profile navigation without replacing the existing logout control", () => {
  const markup = renderToStaticMarkup(createElement(AccountMenu, { email: "an@example.com" }));
  assert.match(markup, /href="\/account\/profile"/u);
  assert.match(markup, />Hồ sơ</u);
  assert.match(markup, /Đăng xuất/u);
});
