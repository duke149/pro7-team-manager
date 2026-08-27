"use client";

import { useEffect, useState } from "react";

export const MAX_DEADLINE_TIMEOUT_MS = 2_147_483_647;

function closedAt(deadline: string | null, now: string | number): boolean {
  if (deadline === null) return true;
  const deadlineTime = Date.parse(deadline);
  const nowTime = typeof now === "number" ? now : Date.parse(now);
  return !Number.isFinite(deadlineTime) || !Number.isFinite(nowTime) || nowTime > deadlineTime;
}

export function useRsvpDeadlineClosed(deadline: string | null, serverNow: string): boolean {
  const serverClosed = closedAt(deadline, serverNow);
  const [live, setLive] = useState(() => ({ deadline, closed: serverClosed }));
  const closed = serverClosed || (live.deadline === deadline && live.closed);

  useEffect(() => {
    if (deadline === null) return;
    const deadlineTime = Date.parse(deadline);
    if (!Number.isFinite(deadlineTime)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function schedule() {
      const remaining = deadlineTime - Date.now();
      const delay = remaining < 0 ? 0 : Math.min(remaining + 1, MAX_DEADLINE_TIMEOUT_MS);
      timer = setTimeout(() => {
        if (closedAt(deadline, Date.now())) setLive({ deadline, closed: true });
        else schedule();
      }, delay);
    }
    schedule();
    return () => { if (timer !== undefined) clearTimeout(timer); };
  }, [deadline, serverNow]);

  return closed;
}
