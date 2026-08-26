"use client";

import { MoreHorizontal, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { TACTIC_FORMATIONS, TACTIC_LEVELS, TACTIC_MODES, type MatchTactic, type TacticFormation, type TacticLevel, type TacticMode, type TacticRole, type TacticSlot, type TacticsDetail, type TacticsPlayer } from "../../../../../lib/tactics/model";

type Draft = Omit<MatchTactic, "id" | "status" | "appliedAt"> & { id: string | null; expectedUpdatedAt: string | null };
const MODE_LABELS: Record<TacticMode, string> = { balanced: "Cân bằng", attacking: "Tấn công", defensive: "Phòng ngự" };
const LEVEL_LABELS: Record<TacticLevel, string> = { low: "Thấp", medium: "Trung bình", high: "Cao" };
const SHAPES: Record<TacticFormation, readonly { role: TacticRole; x: number; y: number }[]> = {
  "2-3-1": [{ role: "GK", x: 50, y: 90 }, { role: "DEF", x: 30, y: 72 }, { role: "DEF", x: 70, y: 72 }, { role: "MID", x: 22, y: 48 }, { role: "MID", x: 50, y: 43 }, { role: "MID", x: 78, y: 48 }, { role: "ATT", x: 50, y: 18 }],
  "3-2-1": [{ role: "GK", x: 50, y: 90 }, { role: "DEF", x: 22, y: 69 }, { role: "DEF", x: 50, y: 73 }, { role: "DEF", x: 78, y: 69 }, { role: "MID", x: 35, y: 43 }, { role: "MID", x: 65, y: 43 }, { role: "ATT", x: 50, y: 18 }],
  "2-2-2": [{ role: "GK", x: 50, y: 90 }, { role: "DEF", x: 32, y: 69 }, { role: "DEF", x: 68, y: 69 }, { role: "MID", x: 32, y: 44 }, { role: "MID", x: 68, y: 44 }, { role: "ATT", x: 32, y: 19 }, { role: "ATT", x: 68, y: 19 }],
};

function playerName(player: TacticsPlayer | undefined) { return player?.displayName ?? "Chưa cập nhật tên"; }
function initials(value: string) { return value.trim().split(/\s+/u).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN")).join("") || "CT"; }
function clamp(value: number) { return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100; }
function apiMessage(value: unknown, fallback: string) { return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string" ? value.message : fallback; }

function defaultSlots(players: readonly TacticsPlayer[], formation: TacticFormation): readonly TacticSlot[] {
  if (players.length < 7) return [];
  const keeper = players.find((player) => player.officialPosition === "GK") ?? players[0];
  const selected = [keeper, ...players.filter((player) => player.userId !== keeper.userId)].slice(0, 7);
  const starters = selected.map((player, index) => Object.freeze({ userId: player.userId, slotKind: "starter" as const, slotKey: `starter-${index + 1}`, roleLabel: SHAPES[formation][index].role, shirtNumber: player.shirtNumber, x: SHAPES[formation][index].x, y: SHAPES[formation][index].y }));
  const starterIds = new Set(starters.map((slot) => slot.userId));
  const bench = players.filter((player) => !starterIds.has(player.userId)).slice(0, 23).map((player, index) => Object.freeze({ userId: player.userId, slotKind: "bench" as const, slotKey: `bench-${index + 1}`, roleLabel: player.officialPosition ?? "MID", shirtNumber: player.shirtNumber, x: 0, y: 0 }));
  return Object.freeze([...starters, ...bench]);
}

function draftFor(mode: TacticMode, detail: TacticsDetail): Draft {
  const rows = detail.tactics.filter((tactic) => tactic.mode === mode);
  const draft = rows.find((tactic) => tactic.status === "draft");
  if (draft) return { id: draft.id, mode, formation: draft.formation, instructions: draft.instructions, version: draft.version, pressing: draft.pressing, defensiveLine: draft.defensiveLine, updatedAt: draft.updatedAt, slots: draft.slots, expectedUpdatedAt: draft.updatedAt };
  const applied = rows.find((tactic) => tactic.status === "applied");
  if (applied) return { id: null, mode, formation: applied.formation, instructions: applied.instructions, version: Math.min(32767, applied.version + 1), pressing: applied.pressing, defensiveLine: applied.defensiveLine, updatedAt: applied.updatedAt, slots: applied.slots, expectedUpdatedAt: null };
  return { id: null, mode, formation: "2-3-1", instructions: null, version: 1, pressing: "medium", defensiveLine: "medium", updatedAt: detail.match.updatedAt, slots: defaultSlots(detail.players, "2-3-1"), expectedUpdatedAt: null };
}

function memberTactic(mode: TacticMode, detail: TacticsDetail): Draft | null {
  const applied = detail.tactics.find((tactic) => tactic.mode === mode && tactic.status === "applied");
  return applied ? { id: applied.id, mode, formation: applied.formation, instructions: applied.instructions, version: applied.version, pressing: applied.pressing, defensiveLine: applied.defensiveLine, updatedAt: applied.updatedAt, slots: applied.slots, expectedUpdatedAt: applied.updatedAt } : null;
}

function SectionHead({ label, title, value }: { label: string; title: string; value?: number }) { return <div className="section-head"><div><span>{label}</span><h2>{title}</h2></div>{value !== undefined && <strong>{value}</strong>}</div>; }

export function TacticsBoard({ slug, teamName, detail, canManage }: { slug: string; teamName: string; detail: TacticsDetail; canManage: boolean }) {
  const router = useRouter();
  const firstMode = detail.tactics[0]?.mode ?? "balanced";
  const [mode, setMode] = useState<TacticMode>(firstMode);
  const [drafts, setDrafts] = useState<Partial<Record<TacticMode, Draft>>>(() => canManage ? Object.fromEntries(TACTIC_MODES.map((entry) => [entry, draftFor(entry, detail)])) : Object.fromEntries(TACTIC_MODES.flatMap((entry) => { const tactic = memberTactic(entry, detail); return tactic ? [[entry, tactic]] : []; })));
  const [dirty, setDirty] = useState<Partial<Record<TacticMode, boolean>>>({});
  const [state, setState] = useState({ pending: false, message: "", error: false });
  const dragging = useRef<string | null>(null);
  const draft = drafts[mode] ?? null;
  const players = new Map(detail.players.map((player) => [player.userId, player]));
  const starters = draft?.slots.filter((slot) => slot.slotKind === "starter") ?? [];
  const bench = draft?.slots.filter((slot) => slot.slotKind === "bench") ?? [];

  function change(update: (current: Draft) => Draft) {
    if (!canManage || !draft) return;
    setDrafts((current) => ({ ...current, [mode]: update(current[mode] as Draft) }));
    setDirty((current) => ({ ...current, [mode]: true }));
    setState({ pending: false, message: "", error: false });
  }
  function move(userId: string, x: number, y: number) { change((current) => ({ ...current, slots: current.slots.map((slot) => slot.userId === userId ? { ...slot, x: clamp(x), y: clamp(y) } : slot) })); }
  function keyMove(event: KeyboardEvent<HTMLButtonElement>, slot: TacticSlot) {
    const step = event.shiftKey ? 10 : 2;
    const delta = event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, -step] : event.key === "ArrowDown" ? [0, step] : null;
    if (!delta || !canManage) return;
    event.preventDefault(); move(slot.userId, slot.x + delta[0], slot.y + delta[1]);
  }
  function pointerMove(event: PointerEvent<HTMLElement>) {
    if (!canManage || !dragging.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    move(dragging.current, (event.clientX - bounds.left) / bounds.width * 100, (event.clientY - bounds.top) / bounds.height * 100);
  }
  async function mutate(action: "save" | "apply") {
    if (!canManage || !draft) return;
    setState({ pending: true, message: "", error: false });
    const payload = action === "save"
      ? { action, tacticId: draft.id, mode: draft.mode, formation: draft.formation, instructions: draft.instructions?.trim() || null, version: draft.version, pressing: draft.pressing, defensiveLine: draft.defensiveLine, slots: draft.slots, expectedUpdatedAt: draft.expectedUpdatedAt }
      : { action, tacticId: draft.id, expectedUpdatedAt: draft.expectedUpdatedAt };
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(slug)}/tactics/${encodeURIComponent(detail.match.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) { setState({ pending: false, message: apiMessage(data, "Không thể cập nhật chiến thuật."), error: true }); return; }
      setState({ pending: false, message: action === "save" ? "Đã lưu bản nháp." : "Đã áp dụng đội hình.", error: false });
      setDirty((current) => ({ ...current, [mode]: false })); router.refresh();
    } catch { setState({ pending: false, message: "Không thể cập nhật chiến thuật.", error: true }); }
  }

  if (!draft) return <div className="view-stack tactics-view" data-state="empty"><section className="card tactics-state"><h2>Chưa có chiến thuật đã áp dụng</h2><p>Không có đội hình công khai ở chế độ này.</p></section></div>;
  const ready = starters.length === 7 && starters.filter((slot) => slot.roleLabel === "GK").length === 1;
  return <div className="view-stack tactics-view" data-state={ready ? "ready" : "empty"}>
    <section className="tactics-toolbar card">
      <label>SƠ ĐỒ<select aria-label="Sơ đồ" value={draft.formation} disabled={!canManage} onChange={(event) => change((current) => ({ ...current, formation: event.target.value as TacticFormation }))}>{TACTIC_FORMATIONS.map((formation) => <option key={formation}>{formation}</option>)}</select></label>
      <div className="mode-toggle" aria-label="Chế độ chiến thuật">{TACTIC_MODES.map((entry) => <button type="button" disabled={!canManage && !drafts[entry]} className={mode === entry ? "active" : ""} onClick={() => setMode(entry)} key={entry}>{MODE_LABELS[entry]}</button>)}</div>
      <div>{canManage ? <><button className="soft-button" type="button" disabled={state.pending || !ready} onClick={() => void mutate("save")}><Save size={16} />Lưu bản nháp</button><button className="lime-button" type="button" disabled={state.pending || !draft.id || !draft.expectedUpdatedAt || dirty[mode] || !ready} onClick={() => void mutate("apply")}><Send size={16} />Áp dụng cho đội</button></> : <span className="tactics-readonly"><b>Chỉ đọc</b><small>Đã áp dụng</small></span>}</div>
    </section>
    {!ready ? <section className="card tactics-state"><h2>Cần đúng 7 cầu thủ và một thủ môn</h2><p>Đội hiện chưa có đủ cầu thủ hoạt động để lập đội hình.</p></section> : <section className="tactics-layout">
      <article className="pitch-card"><div className="pitch" onPointerMove={pointerMove} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}><div className="pitch-center" /><div className="penalty top" /><div className="penalty bottom" />{starters.map((slot) => { const player = players.get(slot.userId); const name = playerName(player); return <button key={slot.slotKey} type="button" disabled={!canManage} draggable={canManage} className={`pitch-player ${slot.roleLabel === "GK" ? "keeper" : ""}`} aria-label={`${name}, ${slot.roleLabel}, vị trí ngang ${slot.x}, dọc ${slot.y}. Dùng phím mũi tên để di chuyển.`} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} onKeyDown={(event) => keyMove(event, slot)} onPointerDown={() => { if (canManage) dragging.current = slot.userId; }}><b>{slot.shirtNumber ?? initials(name)}</b><span>{name} • {slot.roleLabel}</span></button>; })}</div><div className="pitch-caption"><span><i className="dot green" />Đội hình {draft.formation}</span><span>{canManage ? "Kéo hoặc dùng phím mũi tên để đổi vị trí" : `${teamName} • Đội hình đã áp dụng`}</span></div></article>
      <aside className="tactics-side"><article className="card instruction-card"><SectionHead label="CHỈ ĐẠO" title="Nhiệm vụ trận đấu" /><textarea aria-label="Chỉ đạo trận đấu" maxLength={2000} readOnly={!canManage} value={draft.instructions ?? ""} onChange={(event) => change((current) => ({ ...current, instructions: event.target.value.trim() ? event.target.value : null }))} placeholder={canManage ? "Nhập chỉ đạo cho trận đấu" : "Chưa có chỉ đạo"} /><label>Cường độ pressing <b>{LEVEL_LABELS[draft.pressing]}</b></label><input aria-label="Cường độ pressing" type="range" min="0" max="2" step="1" disabled={!canManage} value={TACTIC_LEVELS.indexOf(draft.pressing)} onChange={(event) => change((current) => ({ ...current, pressing: TACTIC_LEVELS[Number(event.target.value)] }))} /><label>Hàng phòng ngự <b>{LEVEL_LABELS[draft.defensiveLine]}</b></label><div className="segmented" aria-label="Hàng phòng ngự">{TACTIC_LEVELS.map((level) => <button key={level} type="button" aria-label={LEVEL_LABELS[level]} className={draft.defensiveLine === level ? "active" : ""} disabled={!canManage} onClick={() => change((current) => ({ ...current, defensiveLine: level }))} />)}</div></article><article className="card bench-card"><SectionHead label="DỰ BỊ" title="Băng ghế" value={bench.length} />{bench.length === 0 ? <p className="tactics-muted">Chưa có cầu thủ dự bị.</p> : bench.map((slot) => { const player = players.get(slot.userId); const name = playerName(player); return <div className="bench-player" key={slot.slotKey}><span>{slot.shirtNumber ?? initials(name)}</span><b>{name} • {slot.roleLabel}</b><MoreHorizontal aria-hidden="true" /></div>; })}</article></aside>
    </section>}
    {state.message && <p className={`tactics-message ${state.error ? "error" : "success"}`} role={state.error ? "alert" : "status"}>{state.message}</p>}
  </div>;
}
