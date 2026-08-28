import type { Json } from "../supabase/database.types";
import type { TeamPaymentSettings } from "./model";

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export function parsePaymentSettings(settings: Json): TeamPaymentSettings | null | "malformed" {
  if (!record(settings)) return "malformed";
  if (!("payments" in settings)) return null;
  const value = settings.payments;
  if (!record(value) || Object.keys(value).sort().join(",") !== "accountHolder,accountNumber,bankCode,transferPrefix") return "malformed";
  const bankCode = typeof value.bankCode === "string" ? value.bankCode : "";
  const accountNumber = typeof value.accountNumber === "string" ? value.accountNumber : "";
  const accountHolder = typeof value.accountHolder === "string" ? value.accountHolder : "";
  const transferPrefix = value.transferPrefix;
  if (!/^[A-Z0-9]{2,12}$/u.test(bankCode) || !/^[0-9]{4,32}$/u.test(accountNumber) || accountHolder.length < 2 || accountHolder.length > 100 || accountHolder.trim() !== accountHolder || !(transferPrefix === null || (typeof transferPrefix === "string" && transferPrefix.length >= 1 && transferPrefix.length <= 40 && transferPrefix.trim() === transferPrefix))) return "malformed";
  return Object.freeze({ bankCode, accountNumber, accountHolder, transferPrefix: transferPrefix as string | null });
}
