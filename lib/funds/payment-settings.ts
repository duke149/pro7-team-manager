import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import type { TeamPaymentSettings } from "../settings/model";
import { parsePaymentSettings } from "../settings/payment";
export { buildVietQrUrl } from "./vietqr";

if (typeof window !== "undefined") throw new Error("funds payment settings are server-only");

type Client = SupabaseClient<Database>;
export type TeamPaymentSettingsResult = { ok: true; data: TeamPaymentSettings | null } | { ok: false; error: "server" };

export async function loadTeamPaymentSettings(teamId: string, supplied?: Client): Promise<TeamPaymentSettingsResult> {
  try {
    const supabase = supplied ?? await (await import("../supabase/server")).createServerSupabaseClient();
    const result = await supabase.from("team_settings").select("team_id,settings").eq("team_id", teamId).maybeSingle();
    if (result.error || !result.data || result.data.team_id !== teamId) return { ok: false, error: "server" };
    const payment = parsePaymentSettings(result.data.settings);
    return payment === "malformed" ? { ok: false, error: "server" } : { ok: true, data: payment };
  } catch { return { ok: false, error: "server" }; }
}
