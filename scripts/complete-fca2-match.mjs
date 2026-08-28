import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pficsujapinkmqsyvcfw.supabase.co";
const SUPABASE_KEY = "sb_publishable_32RYtbRIARcCD1V5myqe4Q_mx33eCEL";

const MATCH_ID = "71498d3d-e4f4-422c-aba1-8c6c9792414f";

const TEST_PLAYERS = [
  { name: "Test 1", userId: "976107bf-de4b-42c4-ab0f-24d7fc660b86", pos: "ATT", shirt: 82 },
  { name: "Test 2", userId: "f68789af-5f23-4782-8f76-127d6d5af8bf", pos: "MID", shirt: 83 },
  { name: "Test 3", userId: "bbc933f2-249f-4306-a078-0052d0c29e33", pos: "MID", shirt: 84 },
  { name: "Test 4", userId: "d7860ed1-f3ce-47cd-9e85-753539d5799e", pos: "DEF", shirt: 85 },
  { name: "Test 5", userId: "16f5bef9-064f-4b39-9f9d-0b6d2fb71392", pos: "DEF", shirt: 86 },
  { name: "Test 6", userId: "a7c89cd7-7b99-4c28-afa8-521aa3f68cef", pos: "DEF", shirt: 87 },
  { name: "Test 7", userId: "33d7628a-6f41-48a5-a41b-8f4439a9c212", pos: "GK", shirt: 81 },
];

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Login as admin hunglt
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: "hunglt@pro7.test",
    password: "Sup3rm4n001@!",
  });
  if (authError || !authData.session) {
    throw new Error(`Auth failed: ${authError?.message}`);
  }
  console.log("Logged in as hunglt successfully!");

  // Get team_id for nat-fc
  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .select("id, name, slug")
    .eq("slug", "nat-fc")
    .single();
  if (teamErr || !team) throw new Error(`Team error: ${teamErr?.message}`);
  console.log("Team info:", team);
  const teamId = team.id;

  // 1. Invite 7 test players if not already invited
  console.log("1. Mời 7 cầu thủ tham gia trận đấu...");
  const userIds = TEST_PLAYERS.map(p => p.userId);
  const { error: inviteErr } = await supabase.rpc("invite_match_attendance", {
    p_team_id: teamId,
    p_match_id: MATCH_ID,
    p_user_ids: userIds,
  });
  if (inviteErr) console.log("Invite note:", inviteErr.message);

  // 2. Mark attendance as available for all 7 test players
  console.log("2. Xác nhận điểm danh 'Có mặt' cho 7 cầu thủ test...");
  for (const p of TEST_PLAYERS) {
    const { error: rsvpErr } = await supabase.rpc("respond_match_attendance", {
      p_team_id: teamId,
      p_match_id: MATCH_ID,
      p_user_id: p.userId,
      p_status: "available",
      p_note: null,
      p_expected_updated_at: null,
    });
    if (rsvpErr) console.log(`RSVP ${p.name} note:`, rsvpErr.message);
    else console.log(` -> ${p.name} (${p.pos}) đã có mặt`);
  }

  // 3. Save and apply 3-2-1 tactic with these 7 players
  console.log("3. Lưu và áp dụng chiến thuật 3-2-1 với 7 cầu thủ test...");
  const slots = [
    { slotKind: "starter", slotKey: "starter-1", roleLabel: "GK", userId: TEST_PLAYERS[6].userId, shirtNumber: 81, x: 50, y: 90 },
    { slotKind: "starter", slotKey: "starter-2", roleLabel: "DEF", userId: TEST_PLAYERS[3].userId, shirtNumber: 85, x: 22, y: 69 },
    { slotKind: "starter", slotKey: "starter-3", roleLabel: "DEF", userId: TEST_PLAYERS[4].userId, shirtNumber: 86, x: 50, y: 73 },
    { slotKind: "starter", slotKey: "starter-4", roleLabel: "DEF", userId: TEST_PLAYERS[5].userId, shirtNumber: 87, x: 78, y: 69 },
    { slotKind: "starter", slotKey: "starter-5", roleLabel: "MID", userId: TEST_PLAYERS[1].userId, shirtNumber: 83, x: 35, y: 43 },
    { slotKind: "starter", slotKey: "starter-6", roleLabel: "MID", userId: TEST_PLAYERS[2].userId, shirtNumber: 84, x: 65, y: 43 },
    { slotKind: "starter", slotKey: "starter-7", roleLabel: "ATT", userId: TEST_PLAYERS[0].userId, shirtNumber: 82, x: 50, y: 18 },
  ];

  const { data: tacticId, error: saveTacticErr } = await supabase.rpc("manage_tactic", {
    p_action: "save",
    p_team_id: teamId,
    p_match_id: MATCH_ID,
    p_tactic_id: null,
    p_mode: "attacking",
    p_formation: "3-2-1",
    p_instructions: "Chuyền nhanh lên tuyến trên cho Test 1 dứt điểm. Test 2 và Test 3 pressing trung tuyến.",
    p_version: 1,
    p_pressing: "high",
    p_defensive_line: "medium",
    p_slots: slots,
    p_expected_updated_at: null,
  });
  console.log("Saved tactic ID:", tacticId, saveTacticErr ? saveTacticErr.message : "Success");

  if (tacticId) {
    const { error: applyErr } = await supabase.rpc("manage_tactic", {
      p_action: "apply",
      p_team_id: teamId,
      p_match_id: MATCH_ID,
      p_tactic_id: tacticId,
      p_mode: "attacking",
      p_formation: null,
      p_instructions: null,
      p_version: null,
      p_pressing: null,
      p_defensive_line: null,
      p_slots: null,
      p_expected_updated_at: null,
    });
    console.log("Applied tactic:", applyErr ? applyErr.message : "Success");
  }

  // 4. Complete match with score 3 - 1
  console.log("4. Hoàn tất trận đấu: FC NÁT 3 - 1 FC A2...");
  const { data: currentMatch } = await supabase
    .from("matches")
    .select("updated_at")
    .eq("id", MATCH_ID)
    .single();

  const { error: completeErr } = await supabase.rpc("manage_match", {
    p_action: "complete",
    p_team_id: teamId,
    p_match_id: MATCH_ID,
    p_opponent: null,
    p_starts_at: null,
    p_venue: null,
    p_is_home: null,
    p_rsvp_deadline: null,
    p_team_score: 3,
    p_opponent_score: 1,
    p_expected_updated_at: currentMatch?.updated_at,
  });
  console.log("Completed match:", completeErr ? completeErr.message : "3 - 1 Success");

  // 5. Add Match Analysis with Events: Test 1 (2 goals), Test 3 (1 goal)
  console.log("5. Ghi nhận diễn biến trận đấu & cầu thủ xuất sắc...");
  const { data: updatedMatch } = await supabase
    .from("matches")
    .select("updated_at")
    .eq("id", MATCH_ID)
    .single();

  const events = [
    {
      minute: 18,
      sequence_no: 1,
      event_type: "goal",
      team_side: "team",
      player_user_id: TEST_PLAYERS[0].userId, // Test 1
      secondary_user_id: TEST_PLAYERS[1].userId, // Test 2 assist
      note: "Test 1 ghi bàn mở tỉ số sau đường chọc khe của Test 2",
    },
    {
      minute: 34,
      sequence_no: 1,
      event_type: "goal",
      team_side: "team",
      player_user_id: TEST_PLAYERS[2].userId, // Test 3
      secondary_user_id: null,
      note: "Test 3 sút xa đẹp mắt nhân đôi cách biệt",
    },
    {
      minute: 41,
      sequence_no: 1,
      event_type: "goal",
      team_side: "opponent",
      player_user_id: null,
      secondary_user_id: null,
      note: "FC A2 ghi bàn rút ngắn cách biệt từ pha đá phạt",
    },
    {
      minute: 55,
      sequence_no: 1,
      event_type: "goal",
      team_side: "team",
      player_user_id: TEST_PLAYERS[0].userId, // Test 1
      secondary_user_id: TEST_PLAYERS[2].userId, // Test 3 assist
      note: "Test 1 hoàn tất cú đúp ấn định chiến thắng 3-1",
    },
  ];

  const playerStats = [
    {
      user_id: TEST_PLAYERS[0].userId, // Test 1
      minutes_played: 60,
      goals: 2,
      assists: 0,
      rating: 9.4,
      is_mvp: true,
    },
    {
      user_id: TEST_PLAYERS[2].userId, // Test 3
      minutes_played: 60,
      goals: 1,
      assists: 1,
      rating: 8.5,
      is_mvp: false,
    },
    {
      user_id: TEST_PLAYERS[1].userId, // Test 2
      minutes_played: 60,
      goals: 0,
      assists: 1,
      rating: 7.9,
      is_mvp: false,
    },
    {
      user_id: TEST_PLAYERS[3].userId, // Test 4
      minutes_played: 60,
      goals: 0,
      assists: 0,
      rating: 7.6,
      is_mvp: false,
    },
    {
      user_id: TEST_PLAYERS[4].userId, // Test 5
      minutes_played: 60,
      goals: 0,
      assists: 0,
      rating: 7.5,
      is_mvp: false,
    },
    {
      user_id: TEST_PLAYERS[5].userId, // Test 6
      minutes_played: 60,
      goals: 0,
      assists: 0,
      rating: 7.7,
      is_mvp: false,
    },
    {
      user_id: TEST_PLAYERS[6].userId, // Test 7 (GK)
      minutes_played: 60,
      goals: 0,
      assists: 0,
      rating: 8.2,
      is_mvp: false,
    },
  ];

  const teamMetrics = {
    possession: { team: 62, opponent: 38 },
    shots: { team: 15, opponent: 5 },
    shots_on_target: { team: 9, opponent: 2 },
    corners: { team: 6, opponent: 3 },
  };

  const { error: analysisErr } = await supabase.rpc("manage_match_analysis", {
    p_team_id: teamId,
    p_match_id: MATCH_ID,
    p_events: events,
    p_player_stats: playerStats,
    p_team_metrics: teamMetrics,
    p_expected_updated_at: updatedMatch?.updated_at,
  });
  console.log("Analysis result:", analysisErr ? analysisErr.message : "Events & MVP recorded successfully!");

  console.log("=== ĐÃ HOÀN TẤT THIẾT LẬP DỮ LIỆU TRẬN ĐẤU DEMO! ===");
}

main().catch(console.error);
