import assert from "node:assert/strict";
import test from "node:test";

import { resolveTeamLandingPath } from "../lib/teams/navigation";

const slug = "đội bóng";

test("landing resolver uses one deterministic priority across real team routes", () => {
  assert.equal(
    resolveTeamLandingPath(slug, ["finance.read", "settings.read"]),
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/funds",
  );
  assert.equal(
    resolveTeamLandingPath(slug, ["settings.read"]),
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/admin/settings",
  );
  assert.equal(
    resolveTeamLandingPath(slug, ["matches.read", "players.read"]),
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/squad",
  );
  assert.equal(
    resolveTeamLandingPath(slug, ["team.read", "finance.read", "settings.read"]),
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/overview",
  );
});

test("landing resolver gives a tactics-only member the stable tactics landing", () => {
  assert.equal(resolveTeamLandingPath(slug, []), null);
  assert.equal(
    resolveTeamLandingPath(slug, ["tactics.read"]),
    "/teams/%C4%91%E1%BB%99i%20b%C3%B3ng/tactics",
  );
});
