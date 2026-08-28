"use client";

import { useMemo, useState } from "react";
import {
  Activity, Bell, CalendarDays, Check, ChevronDown, CircleDollarSign,
  ClipboardList, Clock3, Coins, CreditCard, Grid2X2, HandCoins, HeartPulse,
  LayoutDashboard, LogOut, MapPin, Menu, MessageCircle, MoreHorizontal, Plus, Save,
  Search, Send, Settings2, Share2, ShieldCheck, Shirt, SlidersHorizontal, Sun,
  Target, TrendingUp, Trophy, UserPlus, Users, WalletCards, X, Moon,
} from "lucide-react";

import { createBrowserSupabaseClient } from "../lib/supabase/client";

type View = "dashboard" | "squad" | "matches" | "tactics" | "funds";
type ModalType = "player" | "expense" | "payment" | null;

export const HOSTED_SQUAD_COPY = {
  title: "Đội hình chính",
  description: "Theo dõi nhân sự, phong độ và vai trò thi đấu.",
  searchPlaceholder: "Tìm theo tên cầu thủ...",
} as const;

const NAV: { id: View; label: string; short: string; icon: typeof Grid2X2 }[] = [
  { id: "dashboard", label: "Tổng quan", short: "Tổng quan", icon: LayoutDashboard },
  { id: "squad", label: "Đội hình", short: "Đội hình", icon: Users },
  { id: "matches", label: "Trận đấu", short: "Trận", icon: Trophy },
  { id: "tactics", label: "Chiến thuật", short: "Sơ đồ", icon: Settings2 },
  { id: "funds", label: "Quỹ đội", short: "Quỹ", icon: WalletCards },
];

const PLAYER_PHOTOS = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDYzJemuvG223jmw9FuSXahJ_HXzXG63qVMdibyPATAxfZUpVaePK7rQakJEkPko1YwalekcQEwa2VXelWWg4le_KrKJpTrDn_K1My_7eJt5ikgPPuuqnlNZrsfK3oMUQHg-yIAriIP-JlfJalbqkyg2CIhtclisMe7g7suxMLIK0pJab6lvqoCPbyK4rKqVB82fwQvqaeNI71d86XkStalqT8o3OFIAELni9cQwuCfCuefn9VHtpGo",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBPUI6-6kJ0zLR7ilLeAqMGI-yqOxjDDVSsErBlu5MycJ5IdfPZ42OnBD63NHTO_LkDGl2RV9pETBe6VLgJy-3QY921I4-QQA7cumGxKTk4RHrwWf0PGcyRyYSN-y7umbKWxcgLD4pJrXXCqCGz8XvTU7-qNufDb_r-9sEc9rroKn0T5G4_nQ32SMEebfUzNhDV6qtcveFSnxhHGqkW8FMTl63aYbfkGBlUCSFRRzTdeWGKy2RcBrAd",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuB7AN93mDnpik1eQQhoxapoatsGg16Nr4U87TC1stC18ibzpPrD5dyhouD7dWy_9E2zchhOiJA0FWQ6JvWs9Bf5ju-cVmkM6Uc0BkEYiIq1tt9MF4zesoNGK6zSjt9AufECoYHXSNapOXbkpQwI3UWCQTGoPpejUEacXreXA65Ifwv4hZCxt-ULxLE0YvwZUalKxmHF6-i_HAW4ch26ByU-ComfKYO6Wxg3VbVeVK-CIM1RrmXHco_x",
];

const basePlayers = [
  { name: "Marcus Trent", number: 10, pos: "ATT", role: "Tiền đạo", matches: 14, stat: "9 bàn", photo: PLAYER_PHOTOS[0], status: "fit" },
  { name: "David Silva", number: 8, pos: "MID", role: "Kiến thiết", matches: 15, stat: "12 kiến tạo", photo: PLAYER_PHOTOS[1], status: "fit" },
  { name: "Liam Kompany", number: 4, pos: "DEF", role: "Trung vệ", matches: 8, stat: "24 tắc bóng", photo: PLAYER_PHOTOS[2], status: "injured" },
  { name: "J. Davis", number: 12, pos: "GK", role: "Thủ môn", matches: 13, stat: "6 sạch lưới", photo: "", status: "fit" },
  { name: "A. Wright", number: 9, pos: "ATT", role: "Tiền đạo", matches: 12, stat: "7 bàn", photo: "", status: "fit" },
  { name: "N. Hoàng", number: 7, pos: "MID", role: "Chạy cánh", matches: 10, stat: "5 kiến tạo", photo: "", status: "fit" },
];

const viewMeta: Record<View, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: "THỨ BẢY, 12 THÁNG 10", title: "Chào buổi sáng, Coach.", description: "Mọi thứ bạn cần để điều hành FC Spartans hôm nay." },
  squad: { eyebrow: "FC SPARTANS • 15 CẦU THỦ", title: HOSTED_SQUAD_COPY.title, description: HOSTED_SQUAD_COPY.description },
  matches: { eyebrow: "MÙA GIẢI 2024/25", title: "Trung tâm trận đấu", description: "Lịch thi đấu, tình trạng tham gia và phân tích sau trận." },
  tactics: { eyebrow: "TRẬN TIẾP THEO • 14/10", title: "Chiến thuật thi đấu", description: "Sắp xếp đội hình 7 người và giao nhiệm vụ." },
  funds: { eyebrow: "THÁNG 10 • 2024", title: "Quỹ đội bóng", description: "Thu chi minh bạch, nhắc phí đúng hạn." },
};

export default function Pro7App() {
  const [view, setView] = useState<View>("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [toast, setToast] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const meta = viewMeta[view];

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const selectView = (next: View) => {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const signOut = async () => {
    setIsSigningOut(true);
    try {
      await createBrowserSupabaseClient().auth.signOut();
    } catch {
      // Demo mode fallback when no remote auth is connected
    } finally {
      setIsSigningOut(false);
      window.location.assign("/login");
    }
  };

  return (
    <div className={`pro7-shell ${theme}`}>
      <Sidebar view={view} menuOpen={menuOpen} onSelect={selectView} onClose={() => setMenuOpen(false)} />
      <div className="app-main">
        <header className="app-header">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Mở trình đơn"><Menu size={22} /></button>
          <div className="page-heading"><span>{meta.eyebrow}</span><h1>{meta.title}</h1><p>{meta.description}</p></div>
          <div className="header-actions">
            <button className="icon-button theme-button" aria-label={theme === "light" ? "Bật giao diện tối" : "Bật giao diện sáng"} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={19} /> : <Sun size={19} />}</button>
            <button className="icon-button notification" aria-label="Thông báo" onClick={() => notify("Bạn không có thông báo mới")}><Bell size={20} /><i>2</i></button>
            <button className="primary-button header-cta" onClick={() => setModal(view === "funds" ? "expense" : "player")}><Plus size={18} />{view === "funds" ? "Thêm khoản chi" : "Thêm cầu thủ"}</button>
            <button className="logout-button" onClick={signOut} disabled={isSigningOut} aria-busy={isSigningOut} aria-label={isSigningOut ? "Đang đăng xuất" : "Đăng xuất"}><LogOut size={17} /><span>{isSigningOut ? "Đang xuất…" : "Đăng xuất"}</span></button>
          </div>
        </header>

        <div className="page-content">
          {view === "dashboard" && <Dashboard onView={selectView} notify={notify} />}
          {view === "squad" && <Squad onAdd={() => setModal("player")} />}
          {view === "matches" && <Matches notify={notify} />}
          {view === "tactics" && <Tactics notify={notify} />}
          {view === "funds" && <Funds onModal={setModal} />}
        </div>
      </div>

      <MobileNav view={view} onSelect={selectView} />
      {modal && <ActionModal type={modal} onClose={() => setModal(null)} onDone={(message) => { setModal(null); notify(message); }} />}
      {toast && <div className="toast" role="status" aria-live="polite"><Check size={18} />{toast}</div>}
    </div>
  );
}

function Sidebar({ view, menuOpen, onSelect, onClose }: { view: View; menuOpen: boolean; onSelect: (v: View) => void; onClose: () => void }) {
  return <>
    <div className={`nav-scrim ${menuOpen ? "show" : ""}`} onClick={onClose} />
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <button className="close-menu" aria-label="Đóng trình đơn" onClick={onClose}><X /></button>
      <div className="logo"><span>7</span><div><b>PRO7</b><small>TEAM MANAGER</small></div></div>
      <button className="team-picker"><span>ĐỘI BÓNG HIỆN TẠI</span><strong><i>FS</i>FC Spartans</strong><small>Đội hình 7 người</small><ChevronDown size={16} /></button>
      <nav className="main-nav">
        <span className="nav-label">QUẢN LÝ</span>
        {NAV.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => onSelect(id)}><Icon size={19} /><span>{label}</span>{id === "matches" && <i className="nav-badge">3</i>}</button>)}
      </nav>
      <div className="season-card"><Trophy size={17} /><div><b>Premier 7s</b><span>Hạng 2 • Vòng 8/18</span></div><strong>#2</strong></div>
      <div className="coach"><div className="initial-avatar lime-avatar">CM</div><div><b>Coach Miller</b><span>Quản lý đội</span></div><MoreHorizontal size={19} /></div>
    </aside>
  </>;
}

function MobileNav({ view, onSelect }: { view: View; onSelect: (v: View) => void }) {
  return <nav className="mobile-nav">{NAV.map(({ id, short, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => onSelect(id)}><Icon size={20} /><span>{short}</span></button>)}</nav>;
}

function Dashboard({ onView, notify }: { onView: (v: View) => void; notify: (s: string) => void }) {
  return <div className="dashboard-view view-stack">
    <section className="dashboard-hero two-col hero-ratio">
      <article className="match-hero dark-card">
        <div className="card-kicker"><span className="live-dot" /> TRẬN ĐẤU TIẾP THEO <i>SÂN NHÀ</i></div>
        <div className="teams-line"><div><small>FC SPARTANS</small><h2>Spartans</h2></div><em>VS</em><div className="away"><small>METRO UNITED</small><h2>Metro</h2></div></div>
        <div className="match-meta"><span><CalendarDays size={15} />Thứ Hai, 14/10 • 19:00</span><span><MapPin size={15} />Riverside Turf • Sân 3</span></div>
        <div className="countdown-row"><div><b>02</b><span>NGÀY</span></div><div><b>14</b><span>GIỜ</span></div><div><b>45</b><span>PHÚT</span></div></div>
        <div className="hero-actions"><button className="lime-button" onClick={() => onView("tactics")}><ClipboardList size={17} />Chốt đội hình</button><button className="dark-ghost" onClick={() => onView("matches")}>Chi tiết trận →</button></div>
      </article>
      <article className="card availability-card">
        <SectionHead label="ĐỘI HÌNH" title="Tình trạng tham gia" value="10/15" />
        <div className="ring-row"><div className="ring"><strong>67%</strong><span>đã chốt</span></div><div className="availability-breakdown"><b><i className="dot green" />10 <span>Sẵn sàng</span></b><b><i className="dot gray" />3 <span>Chờ trả lời</span></b><b><i className="dot red" />2 <span>Vắng mặt</span></b></div></div>
        <button className="soft-button full-button" onClick={() => notify("Đã gửi lời nhắc đến 3 cầu thủ")}><Send size={16} />Nhắc người chưa trả lời</button>
      </article>
    </section>

    <section className="stats-grid">
      <article className="stat-card"><div className="stat-icon"><TrendingUp /></div><span>TỈ LỆ THẮNG</span><div><strong>68%</strong><em>+4%</em></div><small>12 thắng • 4 hòa • 2 thua</small><div className="mini-bars"><i /><i /><i /><i /><i /></div></article>
      <article className="stat-card"><div className="stat-icon"><Activity /></div><span>PHONG ĐỘ GẦN ĐÂY</span><div className="form-badges"><b>W</b><b>W</b><b className="draw">D</b><b>W</b><b className="loss">L</b></div><small>10 điểm trong 5 trận gần nhất</small></article>
      <article className="stat-card"><div className="stat-icon"><Target /></div><span>VUA PHÁ LƯỚI</span><div className="player-brief"><div className="initial-avatar dark-avatar">JD</div><div><b>J. Davis</b><small>Tiền đạo</small></div><strong>14<small>BÀN</small></strong></div></article>
      <article className="stat-card"><div className="stat-icon"><ShieldCheck /></div><span>THỨ HẠNG</span><div><strong>#2</strong><em className="neutral">18 điểm</em></div><small>Kém đội đầu bảng 2 điểm</small></article>
    </section>

    <section className="two-col content-ratio">
      <article className="card"><SectionHead label="ĐỘI BÓNG" title="Tin mới" link="Xem tất cả" />
        <div className="news-list"><News icon={<HeartPulse />} tone="danger" title="M. Silva nghỉ thi đấu 2 tuần" desc="Chấn thương gân kheo nhẹ, dự kiến trở lại cuối tháng." time="2 giờ trước" /><News icon={<SlidersHorizontal />} tone="lime" title="Họp phân tích chiến thuật" desc="Coach Miller hẹn toàn đội lúc 18:00 thứ Năm." time="5 giờ trước" /><News icon={<Shirt />} tone="navy" title="Bộ đồ tập mới đã về" desc="Nhận đồ tại phòng thay đồ trước buổi tập." time="Hôm qua" /></div>
      </article>
      <article className="card"><SectionHead label="LỊCH ĐỘI" title="Sắp diễn ra" link="Mở lịch" />
        <Fixture day="19" month="TH10" team="Spartans vs Metro United" meta="19:00 • Riverside Turf" home /><Fixture day="23" month="TH10" team="Buổi tập chiến thuật" meta="18:30 • Sân tập A" training /><Fixture day="26" month="TH10" team="Northside FC vs Spartans" meta="16:30 • Northside Arena" />
        <button className="text-button" onClick={() => onView("matches")}>Xem toàn bộ lịch <span>→</span></button>
      </article>
    </section>
  </div>;
}

function Squad({ onAdd }: { onAdd: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const players = useMemo(() => basePlayers.filter(p => (filter === "ALL" || p.pos === filter) && p.name.toLowerCase().includes(query.toLowerCase())), [query, filter]);
  return <div className="view-stack">
    <section className="squad-toolbar card"><div className="search-box"><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={HOSTED_SQUAD_COPY.searchPlaceholder} /></div><div className="filter-row">{["ALL", "GK", "DEF", "MID", "ATT"].map(item => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item === "ALL" ? "Tất cả" : item}</button>)}</div><button className="filter-button"><SlidersHorizontal size={17} /> Bộ lọc</button></section>
    <section className="squad-summary"><div><Users /><span>Quân số<strong>15</strong></span></div><div><ShieldCheck /><span>Sẵn sàng<strong>13</strong></span></div><div><HeartPulse /><span>Chấn thương<strong className="red-text">2</strong></span></div><div><Shirt /><span>Tuổi TB<strong>26.4</strong></span></div></section>
    <section className="player-grid">{players.map(player => <PlayerCard key={player.name} player={player} />)}<button className="add-player-card" onClick={onAdd}><span><UserPlus /></span><b>Thêm cầu thủ</b><small>Đăng ký thành viên mới</small></button></section>
  </div>;
}

function PlayerCard({ player }: { player: typeof basePlayers[number] }) {
  return <article className={`player-card ${player.status === "injured" ? "injured" : ""}`}><div className="player-top">{player.photo ? <img src={player.photo} alt={player.name} /> : <div className="initial-avatar">{player.name.split(" ").map(s => s[0]).slice(-2).join("")}</div>}<div><h3>{player.name}</h3><span className="position-chip">{player.pos}</span><span className="role-chip">{player.role}</span>{player.status === "injured" && <span className="injury-chip">Nghỉ 2 tuần</span>}</div><strong>#{player.number}</strong></div><div className="player-stats"><span>TRẬN<strong>{player.matches}</strong></span><span>THÀNH TÍCH<strong>{player.stat}</strong></span><button aria-label={`Tùy chọn ${player.name}`}><MoreHorizontal /></button></div></article>;
}

function Matches({ notify }: { notify: (s: string) => void }) {
  const [reply, setReply] = useState<"yes" | "maybe" | "no">("yes");
  return <div className="view-stack match-center">
    <section className="two-col match-top-grid">
      <article className="confirmed-card"><div className="confirmed-strip"><Check size={18} />Đã tìm thấy đối thủ</div><div className="confirmed-body"><div className="card-kicker dark-kicker"><CalendarDays size={14} /> THỨ BẢY, 19/10 • 19:30</div><h2>FC Spartans <em>vs.</em> Metro City</h2><p><MapPin size={17} /> Riverside Turf, Sân 3</p><div className="crest-line"><span>FS</span><b>VS</b><span className="metro">MC</span></div></div></article>
      <article className="card rsvp-card"><SectionHead label="XÁC NHẬN" title="Bạn có tham gia?" /><div className="rsvp-options"><button className={reply === "yes" ? "active yes" : ""} onClick={() => { setReply("yes"); notify("Đã xác nhận bạn sẽ tham gia"); }}><Check />Có</button><button className={reply === "maybe" ? "active maybe" : ""} onClick={() => setReply("maybe")}><Clock3 />Có thể</button><button className={reply === "no" ? "active no" : ""} onClick={() => setReply("no")}><X />Không</button></div><div className="roster-progress"><span><strong>10</strong>/15 đã xác nhận <b>Tối thiểu: 9</b></span><i><b /></i></div><button className="soft-button full-button" onClick={() => notify("Đã sao chép lời mời trận đấu")}><Share2 size={16} />Chia sẻ lời mời</button></article>
    </section>
    <section className="two-col match-analysis-grid">
      <article className="analysis-card"><div className="analysis-score"><span>PHÂN TÍCH • TRẬN GẦN NHẤT</span><small>KẾT THÚC</small><div className="score-board"><b>FC Spartans</b><strong>3 <em>–</em> 1</strong><b className="muted-team">Rovers FC</b></div></div><div className="analysis-body"><h3>Diễn biến chính</h3><Event minute="12’" text="J. Smith (Kiến tạo: M. Doe)" /><Event minute="34’" text="Rovers: P. Jones" away /><Event minute="55’" text="L. Davis (Kiến tạo: J. Smith)" /><Event minute="88’" text="J. Smith (Phạt đền)" /><div className="motm"><div className="initial-avatar dark-avatar">JS</div><div><span>CẦU THỦ XUẤT SẮC</span><b>J. Smith</b><small>2 bàn • 1 kiến tạo • 8.9 điểm</small></div><Trophy /></div><div className="team-stats"><StatCompare label="Kiểm soát" left="58%" right="42%" /><StatCompare label="Cú sút" left="14" right="8" /><StatCompare label="Trúng đích" left="6" right="3" /><StatCompare label="Phạt góc" left="7" right="4" /></div></div></article>
      <article className="card fixtures-card"><SectionHead label="LỊCH THI ĐẤU" title="Các trận sắp tới" link="Xem lịch" /><Fixture day="19" month="TH10" team="Spartans vs Metro United" meta="19:00 • Riverside Turf" home /><Fixture day="26" month="TH10" team="Northside FC vs Spartans" meta="16:30 • Northside Arena" /><Fixture day="02" month="TH11" team="Spartans vs Eagles" meta="20:00 • Riverside Turf" home /><button className="dashed-button"><Plus />Xếp lịch trận đấu</button></article>
    </section>
  </div>;
}

function Tactics({ notify }: { notify: (s: string) => void }) {
  const [mode, setMode] = useState("Có bóng");
  const [formation, setFormation] = useState("2-3-1");
  const pitchPlayers = [{n:11,r:"LM",x:30,y:20},{n:9,r:"ST",x:70,y:20},{n:8,r:"CM • C",x:50,y:47},{n:7,r:"RM",x:78,y:55},{n:4,r:"LCB",x:30,y:72},{n:5,r:"RCB",x:70,y:72},{n:1,r:"GK",x:50,y:90}];
  return <div className="view-stack">
    <section className="tactics-toolbar card"><label>SƠ ĐỒ<select value={formation} onChange={e => setFormation(e.target.value)}><option>2-3-1</option><option>3-2-1</option><option>2-2-2</option></select></label><div className="mode-toggle">{["Có bóng", "Không bóng"].map(x => <button className={mode === x ? "active" : ""} onClick={() => setMode(x)} key={x}>{x}</button>)}</div><div><button className="soft-button" onClick={() => notify("Đã lưu chiến thuật vào bản nháp")}><Save size={16} />Lưu bản nháp</button><button className="lime-button" onClick={() => notify("Đã áp dụng đội hình cho FC Spartans")}><Send size={16} />Áp dụng cho đội</button></div></section>
    <section className="tactics-layout"><article className="pitch-card"><div className="pitch"><div className="pitch-center" /><div className="penalty top" /><div className="penalty bottom" />{pitchPlayers.map(p => <button key={p.n} className={`pitch-player ${p.n === 1 ? "keeper" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}><b>{p.n}</b><span>{p.r}</span></button>)}</div><div className="pitch-caption"><span><i className="dot green" />Đội hình {formation}</span><span>Kéo cầu thủ để đổi vị trí</span></div></article>
      <aside className="tactics-side"><article className="card instruction-card"><SectionHead label="CHỈ ĐẠO" title="Nhiệm vụ trận đấu" /><textarea defaultValue="Giữ khối đội hình hẹp. Chuyển trạng thái nhanh sang hai biên và gây áp lực ngay sau khi mất bóng." /><label>Cường độ pressing <b>Cao</b></label><input type="range" defaultValue="78" /><label>Hàng phòng ngự <b>Dâng cao</b></label><div className="segmented"><i /><i /><i className="active" /><i /></div></article><article className="card bench-card"><SectionHead label="DỰ BỊ" title="Băng ghế" value="5" />{["J. Davis • GK","M. Silva • CM","A. Wright • ST","T. Phạm • DF"].map((p,i) => <div className="bench-player" key={p}><span>{[12,6,14,3][i]}</span><b>{p}</b><MoreHorizontal /></div>)}</article></aside>
    </section>
  </div>;
}

function Funds({ onModal }: { onModal: (v: ModalType) => void }) {
  return <div className="view-stack funds-view">
    <section className="funds-hero-grid"><article className="balance-card"><span>SỐ DƯ KHẢ DỤNG</span><strong>31.260.000₫</strong><div><b><TrendingUp /> +8.750.000₫</b><small>trong tháng này</small></div><WalletCards /></article><article className="fund-actions"><button onClick={() => onModal("expense")}><span><HandCoins /></span><b>Thêm khoản chi</b><small>Ghi nhận chi phí mới</small></button><button className="lime-action" onClick={() => onModal("payment")}><span><CreditCard /></span><b>Ghi nhận đóng quỹ</b><small>Cập nhật phí thành viên</small></button></article></section>
    <section className="fund-stats"><article><Coins /><span>THU THÁNG NÀY<strong>12.500.000₫</strong><small>12 khoản đã ghi nhận</small></span></article><article><CircleDollarSign /><span>CHI THÁNG NÀY<strong>3.750.000₫</strong><small>5 giao dịch</small></span></article><article><Clock3 /><span>ĐANG CHỜ<strong>3 người</strong><small>1.250.000₫ chưa thu</small></span></article></section>
    <section className="two-col fund-content-grid"><article className="card dues-card"><SectionHead label="THÁNG 10" title="Phí thành viên" value="12/15" /><div className="dues-progress"><i /></div>{[{n:"Marcus J.",r:"Tiền đạo",s:"Đã đóng",a:"500.000₫",p:true},{n:"Tommy P.",r:"Tiền vệ",s:"Chưa đóng",a:"500.000₫",p:false},{n:"David K.",r:"Hậu vệ",s:"Chưa đóng",a:"500.000₫",p:false},{n:"N. Hoàng",r:"Tiền vệ",s:"Đã đóng",a:"500.000₫",p:true}].map(x => <div className={`due-row ${!x.p ? "pending" : ""}`} key={x.n}><div className="initial-avatar">{x.n.slice(0,2)}</div><div><b>{x.n}</b><span>{x.r}</span></div><i className={x.p ? "paid" : "unpaid"}>{x.s}</i><strong>{x.a}</strong></div>)}<button className="soft-button full-button"><MessageCircle size={16} />Nhắc 3 thành viên chưa đóng</button></article>
      <article className="card transactions-card"><SectionHead label="DÒNG TIỀN" title="Giao dịch gần đây" link="Xem tất cả" />{[{d:"24/10",t:"Thuê sân Riverside",a:"−1.200.000₫",i:<MapPin/>},{d:"22/10",t:"Mua 3 bóng thi đấu",a:"−750.000₫",i:<Trophy/>},{d:"18/10",t:"Đóng quỹ tháng 10",a:"+6.000.000₫",i:<CreditCard/>},{d:"12/10",t:"Nước uống & y tế",a:"−480.000₫",i:<HeartPulse/>}].map((x,idx) => <div className="transaction" key={x.t}><span>{x.i}</span><div><b>{x.t}</b><small>{x.d} • {idx === 2 ? "12 thành viên" : "Chi phí đội"}</small></div><strong className={x.a.startsWith("+") ? "income" : ""}>{x.a}</strong></div>)}</article></section>
  </div>;
}

function ActionModal({ type, onClose, onDone }: { type: Exclude<ModalType, null>; onClose: () => void; onDone: (s: string) => void }) {
  const content = type === "player" ? { title: "Thêm cầu thủ", desc: "Tạo hồ sơ thành viên mới", action: "Thêm vào đội" } : type === "expense" ? { title: "Thêm khoản chi", desc: "Ghi nhận chi phí của đội", action: "Lưu khoản chi" } : { title: "Ghi nhận đóng quỹ", desc: "Cập nhật phí thành viên", action: "Xác nhận thanh toán" };
  return <div className="modal-layer" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal"><div className="modal-head"><div><span>PRO7 TEAM MANAGER</span><h2>{content.title}</h2><p>{content.desc}</p></div><button onClick={onClose}><X /></button></div>{type === "player" ? <><label>Họ và tên<input placeholder="Ví dụ: Nguyễn Minh Anh" autoFocus /></label><div className="form-two"><label>Số áo<input type="number" placeholder="17" /></label><label>Vị trí<select><option>Tiền đạo</option><option>Tiền vệ</option><option>Hậu vệ</option><option>Thủ môn</option></select></label></div><label>Số điện thoại<input placeholder="090 123 4567" /></label></> : <><label>{type === "expense" ? "Nội dung chi" : "Thành viên"}<input placeholder={type === "expense" ? "Ví dụ: Thuê sân" : "Tìm tên thành viên"} autoFocus /></label><label>Số tiền<input type="number" placeholder="500000" /></label><label>Ghi chú<textarea placeholder="Thêm ghi chú (không bắt buộc)" /></label></>}<div className="modal-actions"><button className="soft-button" onClick={onClose}>Hủy</button><button className="lime-button" onClick={() => onDone(type === "player" ? "Đã thêm cầu thủ mới vào đội" : type === "expense" ? "Đã lưu khoản chi mới" : "Đã cập nhật thanh toán")}>{content.action}</button></div></div></div>;
}

function SectionHead({ label, title, value, link }: { label: string; title: string; value?: string; link?: string }) { return <div className="section-head"><div><span>{label}</span><h2>{title}</h2></div>{value && <strong>{value}</strong>}{link && <button>{link} →</button>}</div>; }
function News({ icon, tone, title, desc, time }: { icon: React.ReactNode; tone: string; title: string; desc: string; time: string }) { return <div className="news-item"><span className={`news-icon ${tone}`}>{icon}</span><div><b>{title}</b><p>{desc}</p><small>{time}</small></div><button><MoreHorizontal /></button></div>; }
function Fixture({ day, month, team, meta, training, home }: { day: string; month: string; team: string; meta: string; training?: boolean; home?: boolean }) { return <div className="fixture-row"><time>{day}<b>{month}</b></time><span className={training ? "fixture-icon training" : "fixture-icon"}>{training ? <Activity /> : <Trophy />}</span><div><b>{team}</b><small>{meta}</small></div><i>{training ? "TẬP" : home ? "NHÀ" : "KHÁCH"}</i></div>; }
function Event({ minute, text, away }: { minute: string; text: string; away?: boolean }) { return <div className="event-row"><span className={away ? "away-event" : ""}>{away ? <Target /> : <Trophy />}</span><b>{minute}</b><p>{text}</p></div>; }
function StatCompare({ label, left, right }: { label: string; left: string; right: string }) { return <div className="compare-row"><b>{left}</b><span>{label}</span><b>{right}</b></div>; }
