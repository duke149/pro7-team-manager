import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pficsujapinkmqsyvcfw.supabase.co";
const SUPABASE_KEY = "sb_publishable_32RYtbRIARcCD1V5myqe4Q_mx33eCEL";
const TEAM_ID = "bd93e68c-29bf-455a-ba5f-cf32ffc7b976";
const MEMBER_ROLE_ID = "c63f0b51-9f57-4bd9-a50f-fe4bfc2be253";

const TEST_PLAYERS_TO_CLEAN = [
  { name: "Test 1", userId: "976107bf-de4b-42c4-ab0f-24d7fc660b86", shirt: 82, pos: "ATT" },
  { name: "Test 2", userId: "f68789af-5f23-4782-8f76-127d6d5af8bf", shirt: 83, pos: "MID" },
  { name: "Test 3", userId: "bbc933f2-249f-4306-a078-0052d0c29e33", shirt: 84, pos: "MID" },
  { name: "Test 4", userId: "d7860ed1-f3ce-47cd-9e85-753539d5799e", shirt: 85, pos: "DEF" },
  { name: "Test 5", userId: "16f5bef9-064f-4b39-9f9d-0b6d2fb71392", shirt: 86, pos: "DEF" },
  { name: "Test 6", userId: "a7c89cd7-7b99-4c28-afa8-521aa3f68cef", shirt: 87, pos: "DEF" },
  { name: "Test 7 (#81)", userId: "33d7628a-6f41-48a5-a41b-8f4439a9c212", shirt: 81, pos: "GK" },
  { name: "Test 7 (#88)", userId: "4e17bc56-2e33-4cdd-88ca-a9a43be9a59a", shirt: 88, pos: "GK" },
];

async function main() {
  console.log("=== BẮT ĐẦU DỌN DẸP CÁC CẦU THỦ TEST ===");
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: process.env.PRO7_TEST_EMAIL || "admin@pro7.test",
    password: process.env.PRO7_TEST_PASSWORD || "",
  });
  if (authErr) throw authErr;
  console.log("Logged in as admin!");

  for (const player of TEST_PLAYERS_TO_CLEAN) {
    const { error: rpcErr } = await supabase.rpc("manage_team_player", {
      p_team_id: TEAM_ID,
      p_user_id: player.userId,
      p_role_id: MEMBER_ROLE_ID,
      p_shirt_number: player.shirt,
      p_official_position: player.pos,
      p_player_status: "unavailable",
      p_join_date: "2026-08-27",
      p_admin_notes: "Test player cleanup",
      p_deactivate: true,
    });
    if (rpcErr) {
      console.warn(`Lỗi khi ngừng hoạt động ${player.name}:`, rpcErr.message);
    } else {
      console.log(`✅ Đã chuyển sang ngừng hoạt động: ${player.name} (${player.userId})`);
    }
  }

  console.log("=== HOÀN TẤT DỌN DẸP DỮ LIỆU TEST! ===");
}

main().catch(console.error);
