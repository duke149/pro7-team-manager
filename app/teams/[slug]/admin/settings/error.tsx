"use client";
export default function SettingsError({ reset }: { reset: () => void }) { return <div className="settings-view"><section className="card settings-state"><h2>Không thể tải cài đặt</h2><p>Vui lòng thử lại mà không làm mất dữ liệu khác.</p><button className="primary-button" type="button" onClick={reset}>Thử lại</button></section></div>; }
