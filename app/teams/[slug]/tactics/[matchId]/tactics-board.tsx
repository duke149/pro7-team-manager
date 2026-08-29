"use client";

import { MoreHorizontal, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { isUuid } from "../../../../../lib/matches/model";
import { isIsoTimestamp } from "../../../../../lib/matches/validation";
import { TACTIC_FORMATIONS, TACTIC_LEVELS, type MatchTactic, type TacticFormation, type TacticLevel, type TacticRole, type TacticSlot, type TacticsDetail, type TacticsPlayer } from "../../../../../lib/tactics/model";

type Draft = Omit<MatchTactic, "id" | "status" | "appliedAt"> & { id: string | null; expectedUpdatedAt: string | null };
const DISPLAY_MODES = [{ mode: "attacking", label: "Có bóng" }, { mode: "defensive", label: "Không bóng" }] as const;
type DisplayMode = (typeof DISPLAY_MODES)[number]["mode"];
const LEVEL_LABELS: Record<TacticLevel, string> = { low: "Thấp", medium: "Trung bình", high: "Cao" };
const SHAPES: Record<TacticFormation, readonly { role: TacticRole; x: number; y: number }[]> = {
  "2-3-1": [{ role: "GK", x: 50, y: 90 }, { role: "DEF", x: 30, y: 72 }, { role: "DEF", x: 70, y: 72 }, { role: "MID", x: 22, y: 48 }, { role: "MID", x: 50, y: 43 }, { role: "MID", x: 78, y: 48 }, { role: "ATT", x: 50, y: 18 }],
  "3-2-1": [{ role: "GK", x: 50, y: 90 }, { role: "DEF", x: 22, y: 69 }, { role: "DEF", x: 50, y: 73 }, { role: "DEF", x: 78, y: 69 }, { role: "MID", x: 35, y: 43 }, { role: "MID", x: 65, y: 43 }, { role: "ATT", x: 50, y: 18 }],
  "2-2-2": [{ role: "GK", x: 50, y: 90 }, { role: "DEF", x: 32, y: 69 }, { role: "DEF", x: 68, y: 69 }, { role: "MID", x: 32, y: 44 }, { role: "MID", x: 68, y: 44 }, { role: "ATT", x: 32, y: 19 }, { role: "ATT", x: 68, y: 19 }],
};

function playerName(player: TacticsPlayer | undefined) {
  return player?.displayName ?? (player ? `Cầu thủ • ${player.userId.slice(0, 8)}` : "Cầu thủ không xác định");
}
function initials(value: string) { return value.trim().split(/\s+/u).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN")).join("") || "CT"; }
function clamp(value: number) { return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100; }
function apiMessage(value: unknown, fallback: string) { return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string" ? value.message : fallback; }
function nextVersion(version: number) { return Number.isSafeInteger(version) && version >= 1 && version < 32767 ? version + 1 : null; }
function savedTactic(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const outer = value as Record<string, unknown>;
  if (outer.ok !== true || typeof outer.tactic !== "object" || outer.tactic === null || Array.isArray(outer.tactic)) return null;
  const tactic = outer.tactic as Record<string, unknown>;
  return isUuid(tactic.id) && Number.isInteger(tactic.version) && (tactic.version as number) >= 1 && (tactic.version as number) <= 32767 && isIsoTimestamp(tactic.updatedAt)
    ? { id: tactic.id, version: tactic.version as number, updatedAt: tactic.updatedAt }
    : null;
}

function defaultSlots(players: readonly TacticsPlayer[], formation: TacticFormation): readonly TacticSlot[] {
  if (players.length < 7) return [];
  const keeper = players.find((player) => player.officialPosition === "GK") ?? players[0];
  const selected = [keeper, ...players.filter((player) => player.userId !== keeper.userId)].slice(0, 7);
  const starters = selected.map((player, index) => Object.freeze({ userId: player.userId, slotKind: "starter" as const, slotKey: `starter-${index + 1}`, roleLabel: SHAPES[formation][index].role, shirtNumber: player.shirtNumber, x: SHAPES[formation][index].x, y: SHAPES[formation][index].y }));
  const starterIds = new Set(starters.map((slot) => slot.userId));
  const bench = players.filter((player) => !starterIds.has(player.userId)).slice(0, 23).map((player, index) => Object.freeze({ userId: player.userId, slotKind: "bench" as const, slotKey: `bench-${index + 1}`, roleLabel: player.officialPosition ?? "MID", shirtNumber: player.shirtNumber, x: 0, y: 0 }));
  return Object.freeze([...starters, ...bench]);
}

function draftFor(mode: DisplayMode, detail: TacticsDetail): Draft | null {
  const rows = detail.tactics.filter((tactic) => tactic.mode === mode);
  const draft = rows.find((tactic) => tactic.status === "draft");
  if (draft) return { id: draft.id, mode, formation: draft.formation, instructions: draft.instructions, version: draft.version, pressing: draft.pressing, defensiveLine: draft.defensiveLine, updatedAt: draft.updatedAt, slots: draft.slots, expectedUpdatedAt: draft.updatedAt };
  const applied = rows.find((tactic) => tactic.status === "applied");
  if (applied) {
    const proposedVersion = nextVersion(applied.version);
    return proposedVersion === null ? null : { id: null, mode, formation: applied.formation, instructions: applied.instructions, version: proposedVersion, pressing: applied.pressing, defensiveLine: applied.defensiveLine, updatedAt: detail.match.updatedAt, slots: applied.slots, expectedUpdatedAt: null };
  }
  const legacy = mode === "attacking" ? detail.tactics.find((tactic) => tactic.mode === "balanced" && tactic.status === "draft") ?? detail.tactics.find((tactic) => tactic.mode === "balanced" && tactic.status === "applied") : null;
  if (legacy) return { id: null, mode, formation: legacy.formation, instructions: legacy.instructions, version: 1, pressing: legacy.pressing, defensiveLine: legacy.defensiveLine, updatedAt: legacy.updatedAt, slots: legacy.slots, expectedUpdatedAt: null };
  return { id: null, mode, formation: "2-3-1", instructions: null, version: 1, pressing: "medium", defensiveLine: "medium", updatedAt: detail.match.updatedAt, slots: defaultSlots(detail.players, "2-3-1"), expectedUpdatedAt: null };
}

function memberTactic(mode: DisplayMode, detail: TacticsDetail): Draft | null {
  const applied = detail.tactics.find((tactic) => tactic.mode === mode && tactic.status === "applied")
    ?? (mode === "attacking" ? detail.tactics.find((tactic) => tactic.mode === "balanced" && tactic.status === "applied") : undefined);
  return applied ? { id: applied.id, mode, formation: applied.formation, instructions: applied.instructions, version: applied.version, pressing: applied.pressing, defensiveLine: applied.defensiveLine, updatedAt: applied.updatedAt, slots: applied.slots, expectedUpdatedAt: applied.updatedAt } : null;
}

function withFormation(current: Draft, formation: TacticFormation): Draft {
  const starters = current.slots.filter((slot) => slot.slotKind === "starter");
  const keeper = starters.find((slot) => slot.roleLabel === "GK");
  if (!keeper || starters.length !== 7) return { ...current, formation };
  const ordered = [keeper, ...starters.filter((slot) => slot.slotKey !== keeper.slotKey)];
  const shapeByKey = new Map(ordered.map((slot, index) => [slot.slotKey, SHAPES[formation][index]]));
  return { ...current, formation, slots: current.slots.map((slot) => {
    const shape = shapeByKey.get(slot.slotKey);
    return shape ? { ...slot, roleLabel: shape.role, x: shape.x, y: shape.y } : slot;
  }) };
}

function SectionHead({ label, title, value }: { label: string; title: string; value?: number }) { return <div className="section-head"><div><span>{label}</span><h2>{title}</h2></div>{value !== undefined && <strong>{value}</strong>}</div>; }

export function TacticsBoard({ slug, teamName, detail, canManage }: { slug: string; teamName: string; detail: TacticsDetail; canManage: boolean }) {
  const router = useRouter();
  const firstMode: DisplayMode = canManage || detail.tactics.some((tactic) => tactic.mode === "attacking" || tactic.mode === "balanced") ? "attacking" : "defensive";
  const [mode, setMode] = useState<DisplayMode>(firstMode);
  const [drafts, setDrafts] = useState<Partial<Record<DisplayMode, Draft>>>(() => canManage ? Object.fromEntries(DISPLAY_MODES.flatMap((entry) => { const tactic = draftFor(entry.mode, detail); return tactic ? [[entry.mode, tactic]] : []; })) : Object.fromEntries(DISPLAY_MODES.flatMap((entry) => { const tactic = memberTactic(entry.mode, detail); return tactic ? [[entry.mode, tactic]] : []; })));
  const [versionBlocked, setVersionBlocked] = useState<Partial<Record<DisplayMode, boolean>>>(() => Object.fromEntries(DISPLAY_MODES.map((entry) => [entry.mode, canManage && !detail.tactics.some((tactic) => tactic.mode === entry.mode && tactic.status === "draft") && detail.tactics.some((tactic) => tactic.mode === entry.mode && tactic.status === "applied" && nextVersion(tactic.version) === null)])));
  const [dirty, setDirty] = useState<Partial<Record<DisplayMode, boolean>>>({});
  const [state, setState] = useState({ pending: false, message: "", error: false });
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const dragging = useRef<{ slotKey: string; pointerId: number; element: HTMLButtonElement; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressedClick = useRef<string | null>(null);
  const draft = drafts[mode] ?? null;
  const players = new Map(detail.players.map((player) => [player.userId, player]));
  const starters = draft?.slots.filter((slot) => slot.slotKind === "starter") ?? [];
  const bench = draft?.slots.filter((slot) => slot.slotKind === "bench") ?? [];
  const selectedSlot = draft?.slots.find((slot) => slot.slotKey === selectedSlotKey) ?? null;
  const substitutionGuidance = !canManage
    ? `${teamName} • Đội hình đã áp dụng`
    : !selectedSlot
      ? "Chọn một cầu thủ trên sân hoặc dự bị để thay người"
      : `Đã chọn ${playerName(players.get(selectedSlot.userId))} — chọn cầu thủ ${selectedSlot.slotKind === "starter" ? "dự bị" : "trên sân"} để thay`;

  function change(update: (current: Draft) => Draft) {
    if (!canManage || !draft) return;
    setDrafts((current) => ({ ...current, [mode]: update(current[mode] as Draft) }));
    setDirty((current) => ({ ...current, [mode]: true }));
    setState({ pending: false, message: "", error: false });
  }
  function move(userId: string, x: number, y: number) { change((current) => ({ ...current, slots: current.slots.map((slot) => slot.userId === userId ? { ...slot, x: clamp(x), y: clamp(y) } : slot) })); }
  function swap(slotKey: string, otherSlotKey: string) {
    if (slotKey === otherSlotKey) { setSelectedSlotKey(null); return; }
    change((current) => {
      const first = current.slots.find((slot) => slot.slotKey === slotKey);
      const second = current.slots.find((slot) => slot.slotKey === otherSlotKey);
      if (!first || !second) return current;
      return { ...current, slots: current.slots.map((slot) => {
        if (slot.slotKey !== first.slotKey && slot.slotKey !== second.slotKey) return slot;
        const incoming = slot.slotKey === first.slotKey ? second : first;
        const player = players.get(incoming.userId);
        return { ...slot, userId: incoming.userId, shirtNumber: incoming.shirtNumber, ...(slot.slotKind === "bench" ? { roleLabel: player?.officialPosition ?? "MID" } : {}) };
      }) };
    });
    setSelectedSlotKey(null);
  }
  function selectOrSwap(slotKey: string) {
    if (!canManage) return;
    if (selectedSlotKey) swap(selectedSlotKey, slotKey); else setSelectedSlotKey(slotKey);
  }
  function clickSlot(slotKey: string) {
    if (suppressedClick.current === slotKey) { suppressedClick.current = null; return; }
    selectOrSwap(slotKey);
  }
  function keyMove(event: KeyboardEvent<HTMLButtonElement>, slot: TacticSlot) {
    if ((event.key === "Enter" || event.key === " ") && canManage) { event.preventDefault(); selectOrSwap(slot.slotKey); return; }
    const step = event.shiftKey ? 10 : 2;
    const delta = event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, -step] : event.key === "ArrowDown" ? [0, step] : null;
    if (!delta || !canManage) return;
    event.preventDefault(); move(slot.userId, slot.x + delta[0], slot.y + delta[1]);
  }
  function beginPointer(event: PointerEvent<HTMLButtonElement>, slotKey: string) {
    if (!canManage) return;
    const element = event.currentTarget;
    element.setPointerCapture?.(event.pointerId);
    dragging.current = { slotKey, pointerId: event.pointerId, element, startX: event.clientX, startY: event.clientY, moved: false };
  }
  function clearPointer(pointerId?: number) {
    const active = dragging.current;
    if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
    dragging.current = null;
    try { active.element.releasePointerCapture?.(active.pointerId); } catch { /* capture may already be lost */ }
  }
  function pointerMove(event: PointerEvent<HTMLElement>) {
    const active = dragging.current;
    if (!canManage || !active || active.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) >= 3) active.moved = true;
    const activeSlot = draft?.slots.find((slot) => slot.slotKey === active.slotKey);
    if (!activeSlot || activeSlot.slotKind !== "starter") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    move(activeSlot.userId, (event.clientX - bounds.left) / bounds.width * 100, (event.clientY - bounds.top) / bounds.height * 100);
  }
  function finishPointer(event: PointerEvent<HTMLElement>) {
    const active = dragging.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest<HTMLElement>("[data-slot-key]");
    const targetKey = target?.dataset.slotKey;
    if (active.moved || (targetKey && targetKey !== active.slotKey)) {
      suppressedClick.current = active.slotKey;
      setTimeout(() => { if (suppressedClick.current === active.slotKey) suppressedClick.current = null; }, 0);
    }
    if (targetKey && targetKey !== active.slotKey) swap(active.slotKey, targetKey);
    clearPointer(event.pointerId);
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
      if (action === "save") {
        const authoritative = savedTactic(data);
        if (!authoritative) { setState({ pending: false, message: "Máy chủ trả về bản nháp không hợp lệ.", error: true }); return; }
        setDrafts((current) => ({ ...current, [mode]: { ...(current[mode] as Draft), id: authoritative.id, version: authoritative.version, updatedAt: authoritative.updatedAt, expectedUpdatedAt: authoritative.updatedAt } }));
      } else {
        const proposedVersion = nextVersion(draft.version);
        if (proposedVersion === null) {
          setDrafts((current) => ({ ...current, [mode]: undefined }));
          setVersionBlocked((current) => ({ ...current, [mode]: true }));
        } else {
          setDrafts((current) => ({ ...current, [mode]: { ...(current[mode] as Draft), id: null, version: proposedVersion, updatedAt: detail.match.updatedAt, expectedUpdatedAt: null } }));
        }
      }
      setState({ pending: false, message: action === "save" ? "Đã lưu bản nháp." : "Đã áp dụng đội hình.", error: false });
      setDirty((current) => ({ ...current, [mode]: false })); router.refresh();
    } catch { setState({ pending: false, message: "Không thể cập nhật chiến thuật.", error: true }); }
  }

  if (!draft) return versionBlocked[mode]
    ? <div className="view-stack tactics-view" data-state="error"><section className="card tactics-state"><h2>Không thể tạo phiên bản chiến thuật mới</h2><p>Chiến thuật đã đạt giới hạn phiên bản. Vui lòng liên hệ quản trị hệ thống.</p></section></div>
    : <div className="view-stack tactics-view" data-state="empty"><section className="card tactics-state"><h2>Chưa có chiến thuật đã áp dụng</h2><p>Không có đội hình công khai ở chế độ này.</p></section></div>;
  const ready = starters.length === 7 && starters.filter((slot) => slot.roleLabel === "GK").length === 1;
  const legacyMode = mode === "attacking" && !detail.tactics.some((tactic) => tactic.mode === "attacking") && detail.tactics.some((tactic) => tactic.mode === "balanced");
  return <div className="view-stack tactics-view" data-state={ready ? "ready" : "empty"}>
    <section className="tactics-toolbar card">
      <label>SƠ ĐỒ<select aria-label="Sơ đồ" value={draft.formation} disabled={!canManage} onChange={(event) => change((current) => withFormation(current, event.target.value as TacticFormation))}>{TACTIC_FORMATIONS.map((formation) => <option key={formation} value={formation} aria-selected={draft.formation === formation}>{formation}</option>)}</select></label>
      <div className="mode-toggle" aria-label="Chế độ chiến thuật">{DISPLAY_MODES.map((entry) => <button type="button" aria-pressed={mode === entry.mode} disabled={!canManage && !drafts[entry.mode]} className={mode === entry.mode ? "active" : ""} onClick={() => { clearPointer(); suppressedClick.current = null; setSelectedSlotKey(null); setMode(entry.mode); }} key={entry.mode}>{entry.label}</button>)}</div>
      <div>{canManage ? <><button className="soft-button" type="button" disabled={state.pending || !ready} onClick={() => void mutate("save")}><Save size={16} />Lưu bản nháp</button><button className="lime-button" type="button" disabled={state.pending || !draft.id || !draft.expectedUpdatedAt || dirty[mode] || !ready} onClick={() => void mutate("apply")}><Send size={16} />Áp dụng cho đội</button></> : <span className="tactics-readonly"><b>Chỉ đọc</b><small>Đã áp dụng</small></span>}</div>
    </section>
    {legacyMode && <p className="tactics-message" role="status">Chế độ dữ liệu cũ đang được hiển thị trong mục Có bóng.</p>}
    {!ready ? <section className="card tactics-state"><h2>Cần đúng 7 cầu thủ và một thủ môn</h2><p>Đội hiện chưa có đủ cầu thủ hoạt động để lập đội hình.</p></section> : <section className="tactics-layout">
      <article className="pitch-card">
        <div className="formation-selector" aria-label="Chọn sơ đồ nhanh">{TACTIC_FORMATIONS.map((f) => <button key={f} type="button" className={`formation-btn ${draft.formation === f ? "active" : ""}`} disabled={!canManage} onClick={() => change((current) => withFormation(current, f))}>{f}</button>)}</div>
        <div className="pitch mowed-pitch" onPointerMove={pointerMove} onPointerUp={finishPointer} onPointerCancel={(event) => clearPointer(event.pointerId)}>
          <div className="pitch-center" /><div className="penalty top" /><div className="penalty bottom" />
          {starters.map((slot) => {
            const player = players.get(slot.userId); const name = playerName(player); const isSelected = selectedSlotKey === slot.slotKey;
            return <button key={slot.slotKey} type="button" data-slot-key={slot.slotKey} data-substitution-selected={isSelected} disabled={!canManage} className={`pitch-player ${slot.roleLabel === "GK" ? "keeper" : ""} ${isSelected ? "is-substitution-selected" : ""}`} aria-pressed={isSelected} aria-label={`${name}, ${slot.roleLabel}, vị trí ngang ${slot.x}, dọc ${slot.y}. Dùng phím mũi tên để di chuyển; Enter hoặc phím cách để chọn đổi cầu thủ.`} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} onClick={() => clickSlot(slot.slotKey)} onKeyDown={(event) => keyMove(event, slot)} onPointerDown={(event) => beginPointer(event, slot.slotKey)} onLostPointerCapture={(event) => clearPointer(event.pointerId)}><b>{slot.shirtNumber ?? initials(name)}</b><span>{name} • {slot.roleLabel}</span></button>;
          })}
        </div>
        <div className="pitch-caption"><span><i className="dot green" />Đội hình {draft.formation}</span><span data-substitution-guidance aria-live="polite">{substitutionGuidance}</span></div>
      </article>
      <aside className="tactics-side"><article className="card instruction-card"><SectionHead label="CHỈ ĐẠO" title="Nhiệm vụ trận đấu" /><textarea aria-label="Chỉ đạo trận đấu" maxLength={2000} readOnly={!canManage} value={draft.instructions ?? ""} onChange={(event) => change((current) => ({ ...current, instructions: event.target.value.trim() ? event.target.value : null }))} placeholder={canManage ? "Nhập chỉ đạo cho trận đấu" : "Chưa có chỉ đạo"} /><label>Cường độ pressing <b>{LEVEL_LABELS[draft.pressing]}</b></label><input aria-label="Cường độ pressing" type="range" min="0" max="2" step="1" disabled={!canManage} value={TACTIC_LEVELS.indexOf(draft.pressing)} onChange={(event) => change((current) => ({ ...current, pressing: TACTIC_LEVELS[Number(event.target.value)] }))} /><label>Hàng phòng ngự <b>{LEVEL_LABELS[draft.defensiveLine]}</b></label><div className="segmented" aria-label="Hàng phòng ngự">{TACTIC_LEVELS.map((level) => <button key={level} type="button" aria-label={LEVEL_LABELS[level]} aria-pressed={draft.defensiveLine === level} className={draft.defensiveLine === level ? "active" : ""} disabled={!canManage} onClick={() => change((current) => ({ ...current, defensiveLine: level }))} />)}</div></article><article className="card bench-card"><SectionHead label="DỰ BỊ" title="Băng ghế" value={bench.length} />{bench.length === 0 ? <p className="tactics-muted">Chưa có cầu thủ dự bị.</p> : bench.map((slot) => { const player = players.get(slot.userId); const name = playerName(player); const isSelected = selectedSlotKey === slot.slotKey; return <button type="button" disabled={!canManage} className={`bench-player ${isSelected ? "is-substitution-selected" : ""}`} data-slot-key={slot.slotKey} data-substitution-selected={isSelected} aria-pressed={isSelected} aria-label={`${name}, dự bị. Enter hoặc phím cách để chọn đổi cầu thủ.`} key={slot.slotKey} onClick={() => clickSlot(slot.slotKey)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectOrSwap(slot.slotKey); } }} onPointerDown={(event) => beginPointer(event, slot.slotKey)} onPointerUp={finishPointer} onPointerCancel={(event) => clearPointer(event.pointerId)} onLostPointerCapture={(event) => clearPointer(event.pointerId)}><span>{slot.shirtNumber ?? initials(name)}</span><b>{name} • {slot.roleLabel}</b><MoreHorizontal aria-hidden="true" /></button>; })}</article></aside>
    </section>}
    {state.message && <p className={`tactics-message ${state.error ? "error" : "success"}`} role={state.error ? "alert" : "status"}>{state.message}</p>}
  </div>;
}
