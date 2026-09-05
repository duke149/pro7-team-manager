"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";

import { buildMatchSharePayload } from "../../lib/matches/share";

type Props = Readonly<{
  slug: string;
  matchId: string;
  teamName: string;
  opponent: string;
  startsAt: string;
  venue: string | null;
  className?: string;
}>;

type ShareState = Readonly<{
  pending: boolean;
  message: string;
  fallbackUrl: string | null;
}>;

function isCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
export function MatchShareButton({ className = "share-zalo-btn", ...match }: Props) {
  const [state, setState] = useState<ShareState>({ pending: false, message: "", fallbackUrl: null });
  const [copyState, setCopyState] = useState({ url: "", message: "" });

  async function copyLink() {
    let url: string;
    try {
      url = buildMatchSharePayload({ origin: window.location.origin, ...match }).url;
    } catch {
      setCopyState({ url: "", message: "Không thể tạo link lời mời." });
      return;
    }
    // Keep a selectable URL available even if the browser permission prompt stalls.
    setCopyState({ url, message: "Bạn có thể chọn và sao chép đường dẫn bên dưới." });
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopyState({ url, message: "Đã sao chép link lời mời." });
    } catch {
      setCopyState({ url, message: "Trình duyệt chặn clipboard. Hãy chọn và sao chép link bên dưới." });
    }
  }

  async function share() {
    setState({ pending: true, message: "", fallbackUrl: null });
    let payload;
    try {
      payload = buildMatchSharePayload({ origin: window.location.origin, ...match });
    } catch {
      setState({ pending: false, message: "Không thể tạo link lời mời.", fallbackUrl: null });
      return;
    }

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        setState({ pending: false, message: "Đã mở menu chia sẻ.", fallbackUrl: null });
        return;
      } catch (error) {
        if (isCancelled(error)) {
          setState({ pending: false, message: "", fallbackUrl: null });
          return;
        }
      }
    }

    const clipboardText = `${payload.title}\n${payload.text}\n${payload.url}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(clipboardText);
      setState({ pending: false, message: "Đã sao chép link lời mời.", fallbackUrl: null });
    } catch {
      setState({ pending: false, message: "Hãy sao chép link bên dưới.", fallbackUrl: payload.url });
    }
  }

  return <div className="match-share-control">
    <button className={className} type="button" aria-label="Chia sẻ lời mời trận đấu" disabled={state.pending} onClick={() => void share()}>
      {state.message.startsWith("Đã sao chép") ? <Check aria-hidden="true" /> : state.fallbackUrl ? <Copy aria-hidden="true" /> : <Share2 aria-hidden="true" />}
      {state.pending ? "Đang mở…" : "Chia sẻ lời mời"}
    </button>
    <button className="soft-button" type="button" aria-label="Sao chép link lời mời" onClick={() => void copyLink()}><Copy aria-hidden="true" />Sao chép link</button>
    <span className="match-share-message">Chia sẻ qua ứng dụng có trong menu thiết bị, hoặc sao chép link để gửi qua Messenger/Zalo. Thành viên cần được mời trước khi xác nhận.</span>
    {copyState.message && <span role="status" className="match-share-message">{copyState.message}</span>}
    {state.message && <span className="match-share-message" role="status">{state.message}</span>}
    {(copyState.url || state.fallbackUrl) && <input className="match-share-fallback" aria-label="Link lời mời trận đấu" readOnly value={copyState.url || state.fallbackUrl || ""} onFocus={(event) => event.currentTarget.select()} />}
  </div>;
}
