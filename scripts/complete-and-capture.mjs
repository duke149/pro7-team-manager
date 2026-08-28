import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";

const SUPABASE_URL = "https://pficsujapinkmqsyvcfw.supabase.co";
const SUPABASE_KEY = "sb_publishable_32RYtbRIARcCD1V5myqe4Q_mx33eCEL";
const MATCH_ID = "71498d3d-e4f4-422c-aba1-8c6c9792414f";
const TEAM_ID = "bd93e68c-29bf-455a-ba5f-cf32ffc7b976";
const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";

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
  console.log("=== THỰC THI THIẾT LẬP CHIẾN THUẬT, THI ĐẤU & CHỤP ẢNH ===");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();

  // Login
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill("#login-identifier", process.env.PRO7_TEST_USER || "admin");
  await page.fill("#login-password", process.env.PRO7_TEST_PASSWORD || "");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('button[type="submit"]'),
  ]);

  // 1. Chụp ảnh danh sách cầu thủ có các cầu thủ Test 1 - Test 7
  await page.goto("http://localhost:3000/teams/nat-fc/squad", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_01_squad_athletes.png") });
  console.log("📸 Đã chụp: demo_01_squad_athletes.png");

  // 2. Chụp ảnh Ticket trận đấu FC NÁT vs FC A2 trước khi thi đấu (Đủ 7 người)
  await page.goto("http://localhost:3000/teams/nat-fc/matches", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_02_match_ticket_fca2.png") });
  console.log("📸 Đã chụp: demo_02_match_ticket_fca2.png");

  // 3. Sa bàn chiến thuật cho trận đấu FC A2
  await page.goto(`http://localhost:3000/teams/nat-fc/tactics/${MATCH_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Click Lưu bản nháp
  const saveBtn = await page.$('button:has-text("Lưu bản nháp")');
  if (saveBtn && !(await saveBtn.isDisabled())) {
    await saveBtn.click();
    await page.waitForTimeout(1000);
  }
  // Click Áp dụng cho đội
  const applyBtn = await page.$('button:has-text("Áp dụng cho đội")');
  if (applyBtn && !(await applyBtn.isDisabled())) {
    await applyBtn.click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_03_tactics_board_321.png") });
  console.log("📸 Đã chụp: demo_03_tactics_board_321.png");

  // 4. Hoàn tất trận đấu: FC NÁT 3 - 1 FC A2
  await page.goto(`http://localhost:3000/teams/nat-fc/matches/${MATCH_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const teamScoreInput = await page.$('input[name="teamScore"]');
  if (teamScoreInput) {
    await teamScoreInput.fill("3");
    await page.fill('input[name="opponentScore"]', "1");
    await page.click('button:has-text("Hoàn tất trận")');
    await page.waitForTimeout(2000);
    console.log(" -> Đã hoàn tất trận đấu với tỉ số 3 - 1");
  }

  // 5. Ghi nhận diễn biến trận đấu qua manage_match_analysis:
  // Test 1 ghi 2 bàn, Test 3 ghi 1 bàn, Test 1 là MVP!
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await supabase.auth.signInWithPassword({
    email: process.env.PRO7_TEST_EMAIL || "admin@pro7.test",
    password: process.env.PRO7_TEST_PASSWORD || "",
  });

  const { data: matchData } = await supabase
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
      secondary_user_id: TEST_PLAYERS[1].userId, // Test 2
      note: "Test 1 ghi bàn mở tỉ số",
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
      note: "FC A2 ghi bàn rút ngắn tỉ số",
    },
    {
      minute: 55,
      sequence_no: 1,
      event_type: "goal",
      team_side: "team",
      player_user_id: TEST_PLAYERS[0].userId, // Test 1
      secondary_user_id: TEST_PLAYERS[2].userId, // Test 3
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
      user_id: TEST_PLAYERS[6].userId, // Test 7
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
    p_team_id: TEAM_ID,
    p_match_id: MATCH_ID,
    p_events: events,
    p_player_stats: playerStats,
    p_team_metrics: teamMetrics,
    p_expected_updated_at: matchData?.updated_at,
  });
  console.log("Analysis error:", analysisErr ? analysisErr.message : "None (Success!)");

  // 6. Reload match detail và chụp ảnh dòng thời gian và thông số trận đấu
  await page.goto(`http://localhost:3000/teams/nat-fc/matches/${MATCH_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_04_match_completed_3_1_timeline.png") });
  console.log("📸 Đã chụp: demo_04_match_completed_3_1_timeline.png");

  // 7. Chụp ảnh trang Tổng quan (Overview) với trận thắng mới nhất 3 - 1
  await page.goto("http://localhost:3000/teams/nat-fc/overview", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_05_overview_dashboard.png") });
  console.log("📸 Đã chụp: demo_05_overview_dashboard.png");

  await browser.close();
  console.log("=== HOÀN TẤT CHỤP ẢNH TẤT CẢ CÁC MÀN HÌNH DEMO! ===");
}

main().catch(console.error);
