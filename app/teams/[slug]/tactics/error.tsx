"use client";

export default function TacticsError({ error, reset }: { error?: Error & { digest?: string }; reset?: () => void }) {
  void error;
  return <div className="view-stack tactics-view" data-state="error"><section className="card tactics-state"><h2>Không thể tải chiến thuật</h2><p>Kết nối dữ liệu đang gián đoạn. Vui lòng thử lại.</p><button className="primary-button" type="button" onClick={() => reset?.()}>Thử lại</button></section></div>;
}
