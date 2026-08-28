import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMatchSharePayload,
  canonicalMatchRsvpPath,
  canonicalMatchRsvpUrl,
} from "../lib/matches/share";

const MATCH_ID = "00000000-0000-4000-8000-000000000101";

test("shared RSVP URL is canonical, generic, and contains no account identity", () => {
  const path = canonicalMatchRsvpPath("nat-fc", MATCH_ID);
  const url = canonicalMatchRsvpUrl("https://pro7.example", "nat-fc", MATCH_ID);
  const payload = buildMatchSharePayload({
    origin: "https://pro7.example",
    slug: "nat-fc",
    matchId: MATCH_ID,
    teamName: "FC NÁT",
    opponent: "FC NAT",
    startsAt: "2026-09-06T02:00:00.000Z",
    venue: "Sân CK2",
  });

  assert.equal(path, `/teams/nat-fc/matches/${MATCH_ID}/rsvp`);
  assert.equal(url, `https://pro7.example${path}`);
  assert.deepEqual(payload, {
    title: "FC NÁT mời bạn xác nhận trận đấu",
    text: "FC NÁT vs FC NAT · 09:00 · CHỦ NHẬT, 06/09/2026 · Sân CK2",
    url,
  });
  assert.ok(`${payload.title}${payload.text}${payload.url}`.length <= 600);
  assert.doesNotMatch(JSON.stringify(payload), /user|email|token|recipient/iu);
  assert.equal(Object.isFrozen(payload), true);
});
test("canonical RSVP links reject malformed identities and unsafe origins", () => {
  for (const origin of [
    "http://pro7.example",
    "https://user:pass@pro7.example",
    "https://pro7.example/path",
    "https://pro7.example?next=evil",
    "https://pro7.example#fragment",
  ]) assert.throws(() => canonicalMatchRsvpUrl(origin, "nat-fc", MATCH_ID));

  assert.equal(
    canonicalMatchRsvpUrl("http://localhost:3000", "nat-fc", MATCH_ID),
    `http://localhost:3000/teams/nat-fc/matches/${MATCH_ID}/rsvp`,
  );
  for (const slug of ["", "../admin", "NAT FC", "a".repeat(49)]) {
    assert.throws(() => canonicalMatchRsvpPath(slug, MATCH_ID));
  }
  assert.throws(() => canonicalMatchRsvpPath("nat-fc", "not-a-uuid"));
});
