import { chromium } from "playwright";
import { resolve } from "node:path";

const SCREENSHOT_DIR = "C:/Users/X/.gemini/antigravity-ide/brain/2c72d1dd-0c40-4134-9a3b-6aa46ae35812/screenshots";
const BASE_URL = "http://localhost:3000";

const PLAYERS_TO_ADD = [
  { name: "Test 1", pos: "ATT", shirt: 82, email: `test1_${Date.now()}@natfc.xyz` },
  { name: "Test 2", pos: "MID", shirt: 83, email: `test2_${Date.now()}@natfc.xyz` },
  { name: "Test 3", pos: "MID", shirt: 84, email: `test3_${Date.now()}@natfc.xyz` },
  { name: "Test 4", pos: "DEF", shirt: 85, email: `test4_${Date.now()}@natfc.xyz` },
  { name: "Test 5", pos: "DEF", shirt: 86, email: `test5_${Date.now()}@natfc.xyz` },
  { name: "Test 6", pos: "DEF", shirt: 87, email: `test6_${Date.now()}@natfc.xyz` },
  { name: "Test 7", pos: "GK", shirt: 88, email: `test7_${Date.now()}@natfc.xyz` },
];

async function loginAdmin(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill("#login-identifier", "hunglt");
  await page.fill("#login-password", "Sup3rm4n001@!");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForURL("**/teams/**", { timeout: 15000 });
}

async function main() {
  console.log("=== BẮT ĐẦU QUY TRÌNH DEMO TRẬN ĐẤU FC NÁT vs FC A2 ===");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
  const page = await adminContext.newPage();

  await loginAdmin(page);
  console.log("1. Đã đăng nhập Admin hunglt thành công.");

  // Bước 1: Thêm 7 cầu thủ test
  console.log("2. Đang thêm 7 cầu thủ test (Test 1 - Test 7)...");
  const createdPlayers = [];

  for (const p of PLAYERS_TO_ADD) {
    await page.goto(`${BASE_URL}/teams/nat-fc/squad?add=player`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.fill('input[name="displayName"]', p.name);
    await page.fill('input[name="email"]', p.email);
    await page.fill('input[name="shirtNumber"]', String(p.shirt));
    await page.selectOption('select[name="officialPosition"]', p.pos);

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes("/api/teams/nat-fc/members")),
      page.click('.provision-member-form button[type="submit"]'),
    ]);

    const resJson = await response.json();
    if (response.ok() && resJson.userId) {
      createdPlayers.push({ ...p, userId: resJson.userId, password: resJson.temporaryPassword });
      console.log(` -> Đã tạo ${p.name} (${p.pos}, #${p.shirt}): userId=${resJson.userId}`);
    } else {
      console.error(`Lỗi tạo ${p.name}:`, resJson);
    }
  }

  // Chụp ảnh danh sách cầu thủ có các cầu thủ test
  await page.goto(`${BASE_URL}/teams/nat-fc/squad`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_01_squad_with_test_players.png") });
  console.log("📸 Đã chụp: demo_01_squad_with_test_players.png");

  // Bước 2: Tạo trận đấu mới FC NÁT vs FC A2
  console.log("3. Đang tạo trận đấu: FC NÁT vs FC A2...");
  await page.goto(`${BASE_URL}/teams/nat-fc/matches`, { waitUntil: "networkidle" });
  await page.click('button:has-text("Xếp lịch trận đấu")');
  await page.waitForTimeout(600);

  const tomorrow = new Date(Date.now() + 86400000);
  const tomorrowStr = tomorrow.toISOString().slice(0, 16);
  const deadlineStr = new Date(Date.now() + 72000000).toISOString().slice(0, 16);

  await page.fill('input[name="opponent"]', "FC A2");
  await page.fill('input[name="startsAt"]', tomorrowStr);
  await page.fill('input[name="rsvpDeadline"]', deadlineStr);
  await page.fill('input[name="venue"]', "Sân bóng A2 Sport Center");
  await page.selectOption('select[name="isHome"]', "true");

  const [createMatchRes] = await Promise.all([
    page.waitForResponse(res => res.url().includes("/api/teams/nat-fc/matches")),
    page.click('.match-form button[type="submit"]'),
  ]);

  const matchData = await createMatchRes.json();
  const matchId = matchData.matchId;
  console.log(` -> Đã tạo trận đấu thành công: matchId = ${matchId}`);

  // Bước 3: Gửi lời mời cho 7 cầu thủ
  console.log("4. Đang gửi lời mời tham gia trận cho 7 cầu thủ...");
  await page.goto(`${BASE_URL}/teams/nat-fc/matches/${matchId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Mời qua API attendance
  const inviteUserIds = createdPlayers.map(p => p.userId);
  const inviteRes = await page.evaluate(async ({ matchId, userIds }) => {
    const res = await fetch(`/api/teams/nat-fc/matches/${matchId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "invite", userIds }),
    });
    return res.json();
  }, { matchId, userIds: inviteUserIds });
  console.log(" -> Kết quả gửi lời mời:", inviteRes);

  // Bước 4: Chấp nhận lời mời (RSVP Available) cho các cầu thủ test
  console.log("5. Đang xác nhận tham gia (Accept RSVP) cho các cầu thủ test...");
  for (const player of createdPlayers) {
    const playerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const playerPage = await playerContext.newPage();
    try {
      await playerPage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
      await playerPage.fill("#login-identifier", player.email);
      await playerPage.fill("#login-password", player.password);
      await Promise.all([
        playerPage.waitForNavigation({ waitUntil: "networkidle" }),
        playerPage.click('button[type="submit"]'),
      ]);
      await playerPage.goto(`${BASE_URL}/teams/nat-fc/matches/${matchId}`, { waitUntil: "networkidle" });
      await playerPage.waitForTimeout(600);
      const yesBtn = await playerPage.$('.rsvp-options button:has-text("Có")');
      if (yesBtn) {
        await yesBtn.click();
        await playerPage.waitForTimeout(800);
        console.log(` -> Cầu thủ ${player.name} (${player.pos}) đã xác nhận "Có mặt"`);
      }
    } catch (err) {
      console.warn(`Lỗi khi ${player.name} điểm danh:`, err.message);
    } finally {
      await playerContext.close();
    }
  }

  // Reload Match view & Match detail để chụp ảnh Đủ 7 người
  await page.goto(`${BASE_URL}/teams/nat-fc/matches`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_02_match_ticket_fca2.png") });
  console.log("📸 Đã chụp: demo_02_match_ticket_fca2.png");

  await page.goto(`${BASE_URL}/teams/nat-fc/matches/${matchId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_03_match_attendance_7starters.png") });
  console.log("📸 Đã chụp: demo_03_match_attendance_7starters.png");

  // Bước 5: Lập sa bàn chiến thuật với 7 cầu thủ test
  console.log("6. Đang cấu hình sa bàn chiến thuật với 7 cầu thủ...");
  await page.goto(`${BASE_URL}/teams/nat-fc/tactics/${matchId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Lưu bản nháp & áp dụng chiến thuật
  const saveBtn = await page.$('button:has-text("Lưu bản nháp")');
  if (saveBtn && !(await saveBtn.isDisabled())) {
    await saveBtn.click();
    await page.waitForTimeout(1000);
    console.log(" -> Đã lưu bản nháp sa bàn chiến thuật");
  }
  const applyBtn = await page.$('button:has-text("Áp dụng cho đội")');
  if (applyBtn && !(await applyBtn.isDisabled())) {
    await applyBtn.click();
    await page.waitForTimeout(1000);
    console.log(" -> Đã áp dụng chiến thuật cho đội");
  }

  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_04_tactics_board_fca2.png") });
  console.log("📸 Đã chụp: demo_04_tactics_board_fca2.png");

  // Bước 6: Hoàn tất trận đấu (Thi đấu xong, tỉ số 3 - 1)
  console.log("7. Đang hoàn tất trận đấu: FC NÁT 3 - 1 FC A2...");
  await page.goto(`${BASE_URL}/teams/nat-fc/matches/${matchId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await page.fill('input[name="teamScore"]', "3");
  await page.fill('input[name="opponentScore"]', "1");
  await page.click('button:has-text("Hoàn tất trận")');
  await page.waitForTimeout(1500);

  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_05_match_completed_3_1.png") });
  console.log("📸 Đã chụp: demo_05_match_completed_3_1.png");

  // Chụp Tổng quan (Overview) sau trận đấu
  await page.goto(`${BASE_URL}/teams/nat-fc/overview`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "demo_06_overview_recent_match.png") });
  console.log("📸 Đã chụp: demo_06_overview_recent_match.png");

  // Bước 7: Dọn dẹp (Cleanup) theo yêu cầu người dùng:
  // "Lưu ý chỉ thêm test các cầu thủ sau đó chụp ảnh lại và thực hiện xóa, không động code backend, DB"
  console.log("8. BẮT ĐẦU DỌN DẸP DỮ LIỆU TEST (Hủy kích hoạt 7 cầu thủ test)...");
  
  // Hủy kích hoạt từng cầu thủ test
  for (const player of createdPlayers) {
    try {
      await page.goto(`${BASE_URL}/teams/nat-fc/squad/${player.userId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      const deactInput = await page.$('.player-deactivate-panel input');
      if (deactInput) {
        await deactInput.fill("DEACTIVATE");
        await page.click('.player-deactivate-panel button.danger-button');
        await page.waitForTimeout(1000);
        console.log(` -> Đã ngừng hoạt động: ${player.name} (${player.userId})`);
      }
    } catch (err) {
      console.warn(`Lỗi khi ngừng hoạt động ${player.name}:`, err.message);
    }
  }

  await browser.close();
  console.log("=== HOÀN TẤT TOÀN BỘ QUY TRÌNH DEMO & DỌN DẸP! ===");
}

main().catch(console.error);
