import type { TeamPaymentSettings } from "../settings/model";

function asciiWords(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[Đđ]/gu, "D").toLocaleUpperCase("en-US").replace(/[^A-Z0-9]+/gu, " ").trim().replace(/\s+/gu, " ");
}

export function buildVietQrUrl(payment: TeamPaymentSettings, due: Readonly<{ id: string; displayName: string; amountVnd: number }>) {
  if (!Number.isSafeInteger(due.amountVnd) || due.amountVnd <= 0 || due.amountVnd > 2_000_000_000) throw new Error("invalid due amount");
  const member = asciiWords(due.displayName);
  const prefix = asciiWords(payment.transferPrefix ?? "NOP QUY");
  const description = `${prefix} ${member}`.trim().slice(0, 50);
  if (!description) throw new Error("invalid transfer description");
  const url = new URL(`https://img.vietqr.io/image/${encodeURIComponent(payment.bankCode)}-${encodeURIComponent(payment.accountNumber)}-compact2.png`);
  url.searchParams.set("amount", String(due.amountVnd));
  url.searchParams.set("addInfo", description);
  url.searchParams.set("accountName", payment.accountHolder);
  return Object.freeze({ url: url.toString(), description });
}
