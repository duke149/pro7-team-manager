import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { createElement } from "react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { MatchDetail } from "../app/teams/[slug]/matches/[matchId]/match-detail";
import type { MatchDetail as MatchDetailModel } from "../lib/matches/model";

const MATCH_ID = "00000000-0000-4000-8000-000000000101";
const USER_ID = "00000000-0000-4000-8000-000000000010";
const DETAIL: MatchDetailModel = {
  match: {
    id: MATCH_ID,
    opponent: "Saigon Comets",
    startsAt: "2026-09-05T19:00:00.000Z",
    venue: "Riverside Pitch",
    isHome: true,
    rsvpDeadline: "2026-09-04T19:00:00.000Z",
    status: "completed",
    teamScore: 3,
    opponentScore: 1,
    updatedAt: "2026-09-06T00:00:00.000Z",
    attendance: { invited: 0, available: 0, unavailable: 0, pending: 0 },
    ownAttendance: null,
  },
  attendance: [],
  events: [],
  playerStats: [],
  teamMetrics: null,
  inviteCandidates: [],
  analysisCandidates: [],
};

test("match detail hydrates without locale-dependent date text", async () => {
  const props = {
    slug: "nat-fc",
    teamName: "FC NÁT",
    userId: USER_ID,
    detail: DETAIL,
    canManage: false,
    canRespond: false,
    now: "2026-09-06T00:00:00.000Z",
  };
  const markup = renderToString(createElement(MatchDetail, props));
  assert.match(markup, /02:00 · CHỦ NHẬT, 06\/09\/2026/u);

  const browserWindow = new Window({ url: `https://pro7.example/teams/nat-fc/matches/${MATCH_ID}` });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: browserWindow,
    document: browserWindow.document,
    navigator: browserWindow.navigator,
    HTMLElement: browserWindow.HTMLElement,
    Node: browserWindow.Node,
    Event: browserWindow.Event,
    FormData: browserWindow.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const container = browserWindow.document.createElement("div");
  container.innerHTML = markup;
  browserWindow.document.body.append(container);
  const errors: string[] = [];
  const originalError = console.error;
  const originalDateTimeFormat = Intl.DateTimeFormat;
  console.error = (...values: unknown[]) => { errors.push(values.map(String).join(" ")); };
  Object.defineProperty(Intl, "DateTimeFormat", {
    configurable: true,
    value: class {
      format() { return "CLIENT LOCALE KHÁC SERVER"; }
    },
  });
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, createElement(MatchDetail, props));
      await Promise.resolve();
    });
    assert.equal(errors.filter((message) => /hydration|didn't match|did not match/iu.test(message)).length, 0);
    assert.match(container.textContent ?? "", /02:00 · CHỦ NHẬT, 06\/09\/2026/u);
  } finally {
    if (root) await act(async () => root?.unmount());
    console.error = originalError;
    Object.defineProperty(Intl, "DateTimeFormat", { configurable: true, value: originalDateTimeFormat });
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await browserWindow.happyDOM.abort();
    browserWindow.close();
  }
});
