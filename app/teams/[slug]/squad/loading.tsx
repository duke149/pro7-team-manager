import { EMPTY_FILTERS, SquadSummary, SquadToolbar } from "./squad-view";

export default function SquadLoading() {
  return <div className="view-stack" aria-busy="true"><SquadToolbar slug="" filters={EMPTY_FILTERS} disabled /><SquadSummary players={[]} loading /><section className="player-grid" aria-live="polite" data-state="loading"><article className="player-card squad-empty-state squad-loading-state"><div><span className="squad-loading-dot" aria-hidden="true" /><h2>Đang tải đội hình</h2><p>Dữ liệu cầu thủ đang được đồng bộ.</p></div></article></section></div>;
}
