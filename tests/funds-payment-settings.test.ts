import assert from "node:assert/strict";
import test from "node:test";

import { buildVietQrUrl, loadTeamPaymentSettings } from "../lib/funds/payment-settings";

const TEAM = "00000000-0000-4000-8000-000000000001";

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  constructor(private readonly result: { data: unknown; error: unknown }) {}
  select(value: string) { assert.equal(value, "team_id,settings"); return this; }
  eq(field: string, value: string) { assert.deepEqual([field, value], ["team_id", TEAM]); return this; }
  maybeSingle() { return Promise.resolve(this.result); }
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(resolve?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return Promise.resolve(this.result).then(resolve, reject); }
}

test("Funds payment settings are server-only, strictly parsed, and absence is honest", async () => {
  const configured = await loadTeamPaymentSettings(TEAM, { from(table: string) { assert.equal(table, "team_settings"); return new Query({ data: { team_id: TEAM, settings: { payments: { bankCode: "MB", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: "PRO7 QUY" } } }, error: null }); } } as never);
  assert.deepEqual(configured, { ok: true, data: { bankCode: "MB", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: "PRO7 QUY" } });
  const absent = await loadTeamPaymentSettings(TEAM, { from() { return new Query({ data: { team_id: TEAM, settings: {} }, error: null }); } } as never);
  assert.deepEqual(absent, { ok: true, data: null });
  for (const data of [
    null,
    { team_id: "wrong", settings: {} },
    { team_id: TEAM, settings: { payments: { bankCode: "MB", accountNumber: "unsafe", accountHolder: "LE DUC", transferPrefix: null } } },
  ]) assert.deepEqual(await loadTeamPaymentSettings(TEAM, { from() { return new Query({ data, error: null }); } } as never), { ok: false, error: "server" });
});

test("VietQR uses only validated configuration and one real pending due", () => {
  const result = buildVietQrUrl(
    { bankCode: "MB", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: "PRO7 QUY" },
    { id: "00000000-0000-4000-8000-000000000021", displayName: "Nguyễn An", amountVnd: 500_000 },
  );
  assert.equal(result.description, "PRO7 QUY NGUYEN AN");
  const url = new URL(result.url);
  assert.equal(`${url.origin}${url.pathname}`, "https://img.vietqr.io/image/MB-0901234567-compact2.png");
  assert.equal(url.searchParams.get("amount"), "500000");
  assert.equal(url.searchParams.get("addInfo"), "PRO7 QUY NGUYEN AN");
  assert.equal(url.searchParams.get("accountName"), "LE DUC");
});

test("Funds payment module rejects browser imports", async () => {
  const prior = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {};
  try {
    await assert.rejects(import(`../lib/funds/payment-settings.ts?browser=${Date.now()}`), /server-only/u);
  } finally {
    if (prior === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = prior;
  }
});
