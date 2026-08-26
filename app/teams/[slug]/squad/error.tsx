"use client";

import { EMPTY_FILTERS, SquadSummary, SquadToolbar } from "./squad-view";

export default function SquadError({ error, reset }: { error?: Error & { digest?: string }; reset?: () => void }) {
  void error;
  return <div className="view-stack"><SquadToolbar slug="" filters={EMPTY_FILTERS} disabled /><SquadSummary players={[]} /><section className="player-grid" aria-live="polite" data-state="error"><article className="player-card squad-empty-state squad-error-state"><div><h2>Không thể tải đội hình</h2><p>Kết nối dữ liệu đang gián đoạn. Vui lòng thử lại.</p><button className="primary-button" type="button" onClick={() => reset?.()}>Thử lại</button></div></article></section></div>;
}
