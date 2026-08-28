"use client";

export default function MatchRsvpError({ reset }: { error?: Error & { digest?: string }; reset?: () => void }) {
  return <div className="view-stack match-center" data-state="error"><section className="card match-state"><h2>Không thể tải lời mời</h2><p>Kết nối dữ liệu đang gián đoạn. Vui lòng thử lại.</p><button className="primary-button" type="button" onClick={() => reset?.()}>Thử lại</button></section></div>;
}
