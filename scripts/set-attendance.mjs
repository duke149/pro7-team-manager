import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pficsujapinkmqsyvcfw.supabase.co";
const SUPABASE_KEY = "sb_publishable_32RYtbRIARcCD1V5myqe4Q_mx33eCEL";
const MATCH_ID = "71498d3d-e4f4-422c-aba1-8c6c9792414f";
const TEAM_ID = "bd93e68c-29bf-455a-ba5f-cf32ffc7b976";

async function main() {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: "hunglt@pro7.test",
    password: "Sup3rm4n001@!",
  });
  if (authErr) throw authErr;
  console.log("Logged in!");

  const { data: attendance, error: attErr } = await client
    .from("match_attendance")
    .select("user_id, status, updated_at")
    .eq("match_id", MATCH_ID);
  if (attErr) throw attErr;

  console.log("Found attendance rows:", attendance.length);
  for (const att of attendance) {
    const { error: rpcErr } = await client.rpc("respond_match_attendance", {
      p_team_id: TEAM_ID,
      p_match_id: MATCH_ID,
      p_user_id: att.user_id,
      p_status: "available",
      p_note: null,
      p_expected_updated_at: att.updated_at,
    });
    if (rpcErr) console.log("RPC Err for", att.user_id, rpcErr.message);
    else console.log("Marked available:", att.user_id);
  }
}

main().catch(console.error);
