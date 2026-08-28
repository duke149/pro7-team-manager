# PRO7 Secure QA Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the QA branch deterministic and safe by preventing unit tests from executing manual scripts, removing committed live credentials and obsolete remote-mutating utilities, correcting the Overview permission regression, and restoring clean diff/test gates.

**Architecture:** A small unit-test runner defaults discovery to `tests/` and forwards explicit focused-test paths without scanning the repository root. A static contract guards the command and tracked QA files against credential-bearing/manual automation regressions. Overview receives the viewer permission and renders the recent-form card as a link only when `matches.read` is present.

**Tech Stack:** Node.js 22 test runner, TypeScript/tsx, React 19 server rendering, Vinext, ESLint, Git.

**Spec:** `docs/superpowers/specs/2026-08-28-pro7-qa-backend-crud-completion-design.md`

## Global Constraints

- Preserve the QA branch's approved component order, black/white/red visual system, and responsive behavior.
- Automated tests must never authenticate against or mutate the shared Supabase project.
- Do not rotate credentials, rewrite Git history, apply remote migrations, deploy Edge Functions, merge branches, or deploy production in this plan.
- Use RED/GREEN/refactor for behavior changes and `apply_patch` for source edits.
- Do not expose the compromised credential in new source, tests, output, commit messages, or documentation.

---

### Task 1: Constrain unit discovery and remove unsafe QA automation

**Files:**
- Create: `tests/qa-security-contract.test.mjs`
- Create: `scripts/run-unit-tests.mjs`
- Modify: `package.json`
- Modify: `QA_CHANGELOG.md`
- Delete: QA-only files reported by `git diff --name-only origin/main...HEAD -- scripts`

**Interfaces:**
- Consumes: the npm `test:unit` script and Git's tracked-file list.
- Produces: `test:unit = "node scripts/run-unit-tests.mjs"`, safe default/focused discovery, and a static `qa-security-contract` that prevents discovery/credential regressions.

- [ ] **Step 1: Write the failing security contract**

Create `tests/qa-security-contract.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const qaOnlyScripts = new Set([
  "scripts/capture-analysis-full.mjs",
  "scripts/capture-audit-fixed.mjs",
  "scripts/capture-detail-pages.mjs",
  "scripts/capture-improvements.mjs",
  "scripts/capture-new-header.mjs",
  "scripts/capture-review.mjs",
  "scripts/capture-rewind-reference.mjs",
  "scripts/capture-rewind-results.mjs",
  "scripts/capture-squad-test.mjs",
  "scripts/capture-tactics-board.mjs",
  "scripts/capture-updates.mjs",
  "scripts/capture-viewport-mobile.mjs",
  "scripts/check-matches.mjs",
  "scripts/check-players.mjs",
  "scripts/cleanup-test-players.mjs",
  "scripts/complete-and-capture.mjs",
  "scripts/complete-fca2-match.mjs",
  "scripts/debug-browser-login.mjs",
  "scripts/demo-match-flow.mjs",
  "scripts/full-crawler-capture.mjs",
  "scripts/inspect-flow.mjs",
  "scripts/set-attendance.mjs",
  "scripts/test-auth.mjs",
]);

test("unit discovery is rooted at tests and excludes manual scripts", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["test:unit"], "node scripts/run-unit-tests.mjs");
  const runner = await readFile(new URL("../scripts/run-unit-tests.mjs", import.meta.url), "utf8");
  assert.match(runner, /requested\.length > 0 \? requested : \["tests"\]/u);
  assert.doesNotMatch(runner, /signInWithPassword|SUPABASE|https?:\/\//u);
});

test("QA branch does not retain credential-bearing automation", () => {
  const tracked = new Set(execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split("\n"));
  assert.deepEqual([...qaOnlyScripts].filter((file) => tracked.has(file)), []);
});

test("QA handoff contains no reusable password", async () => {
  const handoff = await readFile(new URL("../QA_CHANGELOG.md", import.meta.url), "utf8");
  assert.doesNotMatch(handoff, /(?:password|mật khẩu)\s*[:/]?\s*`[^`]+`/iu);
});
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
node --test tests/qa-security-contract.test.mjs
```

Expected: three failures because the safe runner does not exist/`test:unit` is unconstrained, QA-only scripts are tracked, and the handoff contains a reusable password.

- [ ] **Step 3: Apply the minimal safe cleanup**

Create `scripts/run-unit-tests.mjs`:

```js
import { spawnSync } from "node:child_process";

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : ["tests"];
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...targets], {
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
```

Change `package.json`:

```json
"test:unit": "node scripts/run-unit-tests.mjs"
```

Delete only the QA-only script paths named in the test. Preserve the pre-existing hosting, release, and approved roster-provisioning scripts.

Replace the credential section in `QA_CHANGELOG.md` with:

```markdown
1. **Đăng nhập**:
   - URL: `http://localhost:3000/login`
   - Dùng tài khoản QA được cung cấp ngoài repository.
   - Không lưu username, password, JWT hoặc service key trong tài liệu và script.
```

Correct the handoff invariant so it says the branch includes frontend and query/permission behavior changes but no approved remote database migration.

- [ ] **Step 4: Run the contract and full discovery GREEN**

Run:

```bash
node --test tests/qa-security-contract.test.mjs
npm run test:unit
```

Expected: the security contract passes; the full runner lists tests only from `tests/`. The known Overview permission test may remain the sole failure until Task 2.

- [ ] **Step 5: Commit Task 1**

```bash
git add package.json QA_CHANGELOG.md tests/qa-security-contract.test.mjs scripts/run-unit-tests.mjs scripts
git commit -m "fix: secure QA test discovery"
```

### Task 2: Restore Overview destination authorization

**Files:**
- Modify: `app/teams/[slug]/overview/overview-view.tsx`
- Modify: `tests/overview-page.test.ts`

**Interfaces:**
- Consumes: `hasPermission({ permissions }, "matches.read")` from `lib/teams/permissions.ts`.
- Produces: `Statistics({ data, teamSlug, canReadMatches })`, which renders the recent-form destination as interactive only for authorized viewers.

- [ ] **Step 1: Strengthen the existing RED assertion**

In `tests/overview-page.test.ts`, retain the existing no-link assertion and add:

```ts
assert.match(markup, /PHONG ĐỘ GẦN ĐÂY/u);
assert.match(markup, /stat-card-interactive[\s\S]*overview-disabled-control/u);
```

This proves the card remains visible but non-interactive rather than disappearing.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test:unit -- tests/overview-page.test.ts
```

Expected: `Overview renders denied match and tactics destinations as non-interactive content` fails because the recent-form card is still an anchor to `/matches`.

- [ ] **Step 3: Implement permission-aware Statistics rendering**

Change the component signature:

```ts
function Statistics({ data, teamSlug, canReadMatches }: {
  data: OverviewData;
  teamSlug: string;
  canReadMatches: boolean;
})
```

Extract the existing recent-form contents into `recentContent`. Render:

```tsx
{canReadMatches
  ? <a className="stat-card stat-card-interactive" href={matchesHref} title="Xem lịch sử và thông số các trận đã đấu">{recentContent}</a>
  : <article className="stat-card stat-card-interactive overview-disabled-control" aria-disabled="true">{recentContent}</article>}
```

At the route composition boundary, pass:

```tsx
<Statistics
  data={data}
  teamSlug={context.team.slug}
  canReadMatches={hasPermission(context, "matches.read")}
/>
```

- [ ] **Step 4: Run focused and navigation tests GREEN**

Run:

```bash
npm run test:unit -- tests/overview-page.test.ts tests/overview-mounted.test.ts tests/product-navigation.test.ts
```

Expected: all tests pass and unauthorized markup contains no Match/Tactics href.

- [ ] **Step 5: Commit Task 2**

```bash
git add app/teams/[slug]/overview/overview-view.tsx tests/overview-page.test.ts
git commit -m "fix: gate overview match destinations"
```

### Task 3: Restore repository quality gates and document the release blocker

**Files:**
- Modify: `QA_CHANGELOG.md`
- Modify: `app/globals.css`
- Test: existing Git diff, ESLint, build, rendered HTML, and unit suites

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: a clean Slice 0 checkpoint with no automatic network auth and an explicit credential-rotation release blocker.

- [ ] **Step 1: Reproduce the mechanical RED gate**

Run:

```bash
git diff --check origin/main...HEAD
```

Expected: failure on the QA branch's trailing whitespace/blank EOF artifacts.

- [ ] **Step 2: Remove only reported whitespace defects**

Use `apply_patch` to remove each line reported by `git diff --check`. Do not reformat unrelated CSS or alter visual declarations.

Append this release note to `QA_CHANGELOG.md`:

```markdown
## Security release blocker

- A previously committed QA credential must be rotated before production release.
- Removing it from the latest tree does not invalidate copies in Git history.
- Rotation and any history rewrite require separate explicit authorization.
```

- [ ] **Step 3: Run the complete Slice 0 verification**

Run:

```bash
npm run test:unit
npm test
npx eslint tests/qa-security-contract.test.mjs tests/overview-page.test.ts app/teams/[slug]/overview/overview-view.tsx
git diff --check origin/main...HEAD
git status --short
```

Expected: unit/build/render tests pass; ESLint reports no errors in the changed JavaScript/TypeScript source files; diff check is clean; only intentional work is present.

- [ ] **Step 4: Review the Slice 0 diff**

Confirm:

- no tracked file contains the compromised password;
- unit discovery cannot reach `scripts/`;
- no approved hosting/roster script was removed;
- unauthorized Overview output contains no Match/Tactics href;
- UI structure and CSS declarations are otherwise unchanged.

- [ ] **Step 5: Commit the quality checkpoint**

```bash
git add QA_CHANGELOG.md app/globals.css
git commit -m "chore: restore QA quality gates"
```

After this task, proceed to the separate Match Analysis implementation plan. Credential rotation remains a named remote-action checkpoint, not part of this local plan.
