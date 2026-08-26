"use client";

import { CircleDollarSign, Clock3, Coins, CreditCard, HandCoins, MapPin, Trophy, WalletCards, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { FinanceEntry, FundsResult, MemberDue } from "../../../../lib/funds/model";
import type { TeamAccessContext } from "../../../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../../../lib/teams/permissions";

type ApiError = Readonly<{ message?: string; fieldErrors?: Readonly<Record<string, string>> }>;
type Dialog = { kind: "entry" } | { kind: "payment" } | { kind: "voidEntry"; entry: FinanceEntry } | { kind: "voidPayment"; due: MemberDue };

function formatVnd(value: number) { return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)}₫`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(`${value}T00:00:00.000Z`)); }
function initials(value: string) { return value.trim().split(/\s+/u).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN")).join("") || "TV"; }
function monthName(value: string) { return `THÁNG ${Number(value.slice(5, 7))}`; }
function responseError(value: unknown, fallback: string): { message: string; fieldErrors: Readonly<Record<string, string>> } { const error = typeof value === "object" && value !== null ? value as ApiError : {}; return { message: typeof error.message === "string" ? error.message : fallback, fieldErrors: error.fieldErrors ?? {} }; }

function useDialogBoundary(close: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter((element) => element.tabIndex >= 0);
      const first = focusable[0]; const last = focusable.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [close]);
  return { dialogRef, firstRef };
}

function EntryDialog({ slug, close }: { slug: string; close: () => void }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({}); const { dialogRef, firstRef } = useDialogBoundary(close);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(""); setFieldErrors({}); const form = new FormData(event.currentTarget);
    const payload = { direction: "expense", amountVnd: Number(form.get("amountVnd")), category: String(form.get("category") ?? ""), occurredOn: String(form.get("occurredOn") ?? ""), description: String(form.get("description") ?? "") };
    try { const response = await fetch(`/api/teams/${encodeURIComponent(slug)}/funds/entries`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const body: unknown = await response.json().catch(() => null); if (!response.ok) { const error = responseError(body, "Không thể lưu khoản chi."); setMessage(error.message); setFieldErrors(error.fieldErrors); setPending(false); return; } router.refresh(); close(); } catch { setMessage("Không thể lưu khoản chi."); setPending(false); }
  }
  return <div className="modal-layer"><section ref={dialogRef} className="modal fund-modal" role="dialog" aria-modal="true" aria-labelledby="entry-dialog-title"><div className="modal-head"><div><span>QUỸ ĐỘI</span><h2 id="entry-dialog-title">Thêm khoản chi</h2><p>Ghi nhận chi phí mới của đội.</p></div><button type="button" onClick={close} aria-label="Đóng"><X /></button></div><form data-form="finance-entry" onSubmit={(event) => void submit(event)}><label>Số tiền<input ref={firstRef} name="amountVnd" type="number" min="1" step="1" required aria-describedby="amount-error" /></label>{fieldErrors.amountVnd && <small id="amount-error" className="fund-field-error">{fieldErrors.amountVnd}</small>}<label>Danh mục<input name="category" maxLength={80} required /></label>{fieldErrors.category && <small className="fund-field-error">{fieldErrors.category}</small>}<label>Ngày giao dịch<input name="occurredOn" type="date" required /></label>{fieldErrors.occurredOn && <small className="fund-field-error">{fieldErrors.occurredOn}</small>}<label>Nội dung<textarea name="description" maxLength={500} required /></label>{fieldErrors.description && <small className="fund-field-error">{fieldErrors.description}</small>}{message && <p className="fund-message error" role="alert">{message}</p>}<div className="modal-actions"><button className="soft-button" type="button" onClick={close}>Hủy</button><button className="primary-button" type="submit" disabled={pending}>{pending ? "Đang lưu…" : "Lưu khoản chi"}</button></div></form></section></div>;
}

function PaymentDialog({ slug, dues, close }: { slug: string; dues: readonly MemberDue[]; close: () => void }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const { dialogRef, firstRef } = useDialogBoundary(close);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const due = dues.find(({ id }) => id === form.get("dueId")); if (!due) { setMessage("Chọn thành viên chưa đóng phí."); return; } setPending(true); setMessage("");
    try { const response = await fetch(`/api/teams/${encodeURIComponent(slug)}/funds/dues`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pay", dueId: due.id, note: String(form.get("note") ?? "").trim() || null, expectedUpdatedAt: due.updatedAt }) }); const body: unknown = await response.json().catch(() => null); if (!response.ok) { setMessage(responseError(body, "Không thể ghi nhận đóng quỹ.").message); setPending(false); return; } router.refresh(); close(); } catch { setMessage("Không thể ghi nhận đóng quỹ."); setPending(false); }
  }
  return <div className="modal-layer"><section ref={dialogRef} className="modal fund-modal" role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title"><div className="modal-head"><div><span>QUỸ ĐỘI</span><h2 id="payment-dialog-title">Ghi nhận đóng quỹ</h2><p>Cập nhật phí thành viên từ danh sách đang chờ.</p></div><button type="button" onClick={close} aria-label="Đóng"><X /></button></div><form onSubmit={(event) => void submit(event)}><label>Thành viên<select ref={firstRef as React.RefObject<HTMLSelectElement>} name="dueId" required defaultValue=""><option value="" disabled>Chọn thành viên</option>{dues.map((due) => <option key={due.id} value={due.id}>{due.displayName} — {formatVnd(due.amountVnd)}</option>)}</select></label><label>Ghi chú<textarea name="note" maxLength={300} /></label>{message && <p className="fund-message error" role="alert">{message}</p>}<div className="modal-actions"><button className="soft-button" type="button" onClick={close}>Hủy</button><button className="primary-button" type="submit" disabled={pending}>{pending ? "Đang lưu…" : "Xác nhận thanh toán"}</button></div></form></section></div>;
}

function VoidDialog({ slug, target, close }: { slug: string; target: Extract<Dialog, { kind: "voidEntry" | "voidPayment" }>; close: () => void }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [fieldError, setFieldError] = useState(""); const { dialogRef, firstRef } = useDialogBoundary(close);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const reason = String(new FormData(event.currentTarget).get("reason") ?? ""); setPending(true); setMessage(""); setFieldError(""); const isDue = target.kind === "voidPayment"; const payload = isDue ? { action: "voidPayment", dueId: target.due.id, reason, expectedUpdatedAt: target.due.updatedAt } : { action: "void", entryId: target.entry.id, reason, expectedUpdatedAt: target.entry.updatedAt };
    try { const response = await fetch(`/api/teams/${encodeURIComponent(slug)}/funds/${isDue ? "dues" : "entries"}`, { method: isDue ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const body: unknown = await response.json().catch(() => null); if (!response.ok) { const error = responseError(body, "Không thể hủy giao dịch."); setMessage(error.message); setFieldError(error.fieldErrors.reason ?? ""); setPending(false); return; } router.refresh(); close(); } catch { setMessage("Không thể hủy giao dịch."); setPending(false); }
  }
  return <div className="modal-layer"><section ref={dialogRef} className="modal fund-modal" role="dialog" aria-modal="true" aria-labelledby="void-dialog-title"><div className="modal-head"><div><span>ĐIỀU CHỈNH</span><h2 id="void-dialog-title">Hủy giao dịch</h2><p>{target.kind === "voidPayment" ? `Hoàn tác thanh toán của ${target.due.displayName}.` : target.entry.description}</p></div><button type="button" onClick={close} aria-label="Đóng"><X /></button></div><form onSubmit={(event) => void submit(event)}><label>Lý do<textarea ref={firstRef as React.RefObject<HTMLTextAreaElement>} name="reason" maxLength={300} required /></label>{fieldError && <small className="fund-field-error">{fieldError}</small>}{message && <p className="fund-message error" role="alert">{message}</p>}<div className="modal-actions"><button className="soft-button" type="button" onClick={close}>Hủy</button><button className="fund-danger-button" type="submit" disabled={pending}>{pending ? "Đang lưu…" : "Xác nhận hủy"}</button></div></form></section></div>;
}

function DueRow({ slug, due, canManage, onVoid }: { slug: string; due: MemberDue; canManage: boolean; onVoid: () => void }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  async function pay() { setPending(true); setMessage(""); try { const response = await fetch(`/api/teams/${encodeURIComponent(slug)}/funds/dues`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pay", dueId: due.id, note: null, expectedUpdatedAt: due.updatedAt }) }); const body: unknown = await response.json().catch(() => null); if (!response.ok) { setMessage(responseError(body, "Không thể ghi nhận đóng quỹ.").message); setPending(false); return; } setPending(false); router.refresh(); } catch { setMessage("Không thể ghi nhận đóng quỹ."); setPending(false); } }
  const paid = due.status === "paid";
  return <div className={`due-row ${due.status === "pending" ? "pending" : ""}`}><div className="initial-avatar">{initials(due.displayName)}</div><div><b>{due.displayName}</b><span>Hạn {formatDate(due.dueDate)}</span>{message && <small className="fund-row-error" role="alert">{message}</small>}</div><i className={paid ? "paid" : due.status === "pending" ? "unpaid" : "waived"}>{paid ? "Đã đóng" : due.status === "pending" ? "Chưa đóng" : "Đã miễn"}</i><strong>{formatVnd(due.amountVnd)}</strong>{canManage && due.status === "pending" && <button className="fund-row-action" disabled={pending} onClick={() => void pay()}>{pending ? "Đang lưu…" : "Đánh dấu đã đóng"}</button>}{canManage && paid && <button className="fund-row-action danger" onClick={onVoid}>Hủy thanh toán</button>}</div>;
}

export function FundsView({ team, permissions, result }: { team: TeamAccessContext["team"]; permissions: readonly PermissionCode[]; result: FundsResult }) {
  const [dialog, setDialog] = useState<Dialog | null>(null); const canManage = hasPermission({ permissions }, "finance.manage");
  if (!result.ok) return <div className="view-stack funds-view funds-state" data-state="error"><section className="card"><h2>Không thể tải quỹ đội</h2><p>Kết nối dữ liệu đang gián đoạn. Vui lòng tải lại trang.</p></section></div>;
  const { data } = result; const empty = data.dues.length === 0 && data.recentEntries.length === 0; const pendingDues = data.dues.filter((due) => due.status === "pending"); const percent = data.totalDuesCount ? Math.round(data.paidDuesCount / data.totalDuesCount * 100) : 0;
  return <div className="view-stack funds-view" data-state={empty ? "empty" : "ready"}>
    <section className="funds-hero-grid"><article className="balance-card"><span>SỐ DƯ KHẢ DỤNG</span><strong>{formatVnd(data.balanceVnd)}</strong><div><b><Coins /> {formatVnd(data.monthIncomeVnd - data.monthExpenseVnd)}</b><small>thay đổi trong tháng này</small></div><WalletCards /></article>{canManage && <article className="fund-actions"><button onClick={() => setDialog({ kind: "entry" })}><span><HandCoins /></span><b>Thêm khoản chi</b><small>Ghi nhận chi phí mới</small></button><button className="lime-action" disabled={pendingDues.length === 0} onClick={() => setDialog({ kind: "payment" })}><span><CreditCard /></span><b>Ghi nhận đóng quỹ</b><small>Cập nhật phí thành viên</small></button></article>}</section>
    <section className="fund-stats"><article><Coins /><span>THU THÁNG NÀY<strong>{formatVnd(data.monthIncomeVnd)}</strong><small>{data.monthIncomeCount} khoản đã ghi nhận</small></span></article><article><CircleDollarSign /><span>CHI THÁNG NÀY<strong>{formatVnd(data.monthExpenseVnd)}</strong><small>{data.monthExpenseCount} giao dịch</small></span></article><article><Clock3 /><span>ĐANG CHỜ<strong>{data.pendingDuesCount} người</strong><small>{formatVnd(data.pendingDuesVnd)} chưa thu</small></span></article></section>
    {empty && <section className="card funds-empty"><h2>Chưa có dữ liệu quỹ</h2><p>Giao dịch và phí thành viên sẽ xuất hiện tại đây.</p></section>}
    {!empty && <section className="two-col fund-content-grid"><article className="card dues-card"><div className="section-head"><div><span>{monthName(data.periodStart)}</span><h2>Phí thành viên</h2></div><strong>{data.paidDuesCount}/{data.totalDuesCount}</strong></div><div className="dues-progress"><i style={{ width: `${percent}%` }} /></div>{data.dues.length === 0 ? <p className="fund-muted">Chưa có phí thành viên trong tháng này.</p> : data.dues.map((due) => <DueRow key={due.id} slug={team.slug} due={due} canManage={canManage} onVoid={() => setDialog({ kind: "voidPayment", due })} />)}</article><article className="card transactions-card"><div className="section-head"><div><span>DÒNG TIỀN</span><h2>Giao dịch gần đây</h2></div></div>{data.recentEntries.length === 0 ? <p className="fund-muted">Chưa có giao dịch.</p> : data.recentEntries.map((entry) => <div className="transaction" key={entry.id}><span>{entry.direction === "income" ? <CreditCard /> : entry.category.toLocaleLowerCase("vi-VN").includes("sân") ? <MapPin /> : <Trophy />}</span><div><b>{entry.description}</b><small>{formatDate(entry.occurredOn)} • {entry.category}</small></div><strong className={entry.direction === "income" ? "income" : ""}>{entry.direction === "income" ? "+" : "−"}{formatVnd(entry.amountVnd)}</strong>{canManage && entry.category !== "member_due" && <button className="fund-void-action" onClick={() => setDialog({ kind: "voidEntry", entry })}>Hủy</button>}</div>)}</article></section>}
    {dialog?.kind === "entry" && <EntryDialog slug={team.slug} close={() => setDialog(null)} />}{dialog?.kind === "payment" && <PaymentDialog slug={team.slug} dues={pendingDues} close={() => setDialog(null)} />}{(dialog?.kind === "voidEntry" || dialog?.kind === "voidPayment") && <VoidDialog slug={team.slug} target={dialog} close={() => setDialog(null)} />}
  </div>;
}
