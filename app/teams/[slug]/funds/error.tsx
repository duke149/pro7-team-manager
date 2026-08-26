"use client";

export default function FundsError({ error, reset }: { error?: Error & { digest?: string }; reset?: () => void }) {
  void error;
  return <div className="view-stack funds-view funds-state" data-state="error"><section className="card"><h2>Không thể tải quỹ đội</h2><p>Kết nối dữ liệu đang gián đoạn. Vui lòng thử lại.</p><button className="primary-button" type="button" onClick={() => reset?.()}>Thử lại</button></section></div>;
}
