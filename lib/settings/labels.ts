const resources: Record<string, string> = {
  team: "đội bóng", members: "thành viên", players: "cầu thủ", matches: "trận đấu",
  tactics: "chiến thuật", finance: "quỹ đội", news: "tin đội", roles: "vai trò", settings: "cài đặt",
};
const actions: Record<string, string> = { read: "Xem", manage: "Quản lý", update: "Cập nhật", delete: "Xóa", respond: "Phản hồi", create: "Tạo" };
export function permissionLabel(code: string) {
  const [resource, action] = code.split(".");
  return resources[resource] && actions[action] ? `${actions[action]} ${resources[resource]}` : code;
}
export function auditResourceLabel(table: string) {
  const labels: Record<string, string> = { teams: "Hồ sơ đội", memberships: "Thành viên", team_players: "Cầu thủ", profiles: "Hồ sơ cá nhân", matches: "Trận đấu", match_attendance: "Tham gia trận", match_tactics: "Chiến thuật", lineup_slots: "Đội hình ra sân", member_dues: "Phí thành viên", finance_entries: "Giao dịch quỹ", team_settings: "Cài đặt đội", team_news: "Tin đội", notifications: "Thông báo" };
  return labels[table] ?? table;
}
