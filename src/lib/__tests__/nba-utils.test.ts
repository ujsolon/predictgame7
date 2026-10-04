import { describe, expect, it } from "vitest";
import * as nbaUtils from "@/lib/nba-utils";

// Alias import (`@/`) instead of a relative path proves alias resolution
// works inside the Vitest test graph.
import {
  PLACEHOLDER_ABBREVIATIONS,
  getRoundImportance,
  getTeamAbbreviation,
  getTeamCode,
} from "@/lib/nba-utils";
import type { Team } from "@/types/types";

// Row fixtures standing for the `teams` FK embed both pages already read
// (Story 2.11 U1). `Seattle SuperSonics` is the golden divergence pair: the
// stored code is `SEA`, the name-derived initialism is `SS`.
const celticsRow: Team = { id: 2, full_name: 'Boston Celtics', abbreviation: 'BOS', created_at: 'a' };
const nuggetsRow: Team = { id: 7, full_name: 'Denver Nuggets', abbreviation: 'DEN', created_at: 'b' };
const heatRow: Team = { id: 16, full_name: 'Miami Heat', abbreviation: 'MIA', created_at: 'c' };
const sonicsRow: Team = { id: 25, full_name: 'Seattle SuperSonics', abbreviation: 'SEA', created_at: 'd' };

describe("getTeamCode — the stored row wins", () => {
  it("prints the matching row's stored abbreviation instead of the name initialism", () => {
    // These two lines are where the deleted `TEAM_ABBREVIATIONS` map used to be
    // consulted (Story 2.11): the value now comes from the row, so a modern team
    // keeps `BOS` without a second hardcoded name→code source.
    expect(getTeamCode("Boston Celtics", celticsRow)).toBe("BOS");
    expect(getTeamCode("Denver Nuggets", nuggetsRow)).toBe("DEN");
    // …and a historical identity prints the code the table holds for it, which
    // is the 39-row visible change on `/historical`.
    expect(getTeamCode("Seattle SuperSonics", sonicsRow)).toBe("SEA");
  });

  it("passes a typed abbreviation through unchanged, now by the name path", () => {
    // The map used to answer `"BOS" → "BOS"` from its own entries; with the map
    // gone the identical result comes out of the truncation branch (three
    // letters, no space), so nothing a fan typed back changed meaning.
    expect(getTeamCode("BOS")).toBe("BOS");
    expect(getTeamCode("GSW")).toBe("GSW");
  });

  it("resolves a predicted winner through whichever candidate row matches", () => {
    // U7: `predicted_winner` carries a name, never a code, so the caller hands
    // both embedded rows to one call and equality on `full_name` discriminates.
    expect(getTeamCode("Miami Heat", celticsRow, heatRow)).toBe("MIA");
    expect(getTeamCode("Boston Celtics", heatRow, celticsRow)).toBe("BOS");
  });

  it("ignores a row that does not name the same team", () => {
    // Exact-after-trim match only — no nickname, city or fuzzy arm beside the
    // archive's substring search (Design Notes).
    expect(getTeamCode("Celtics", celticsRow)).toBe("CEL");
    expect(getTeamCode("  Boston Celtics  ", celticsRow)).toBe("BOS"); // trims first
  });

  it("matches the row without regard to case, as the caller's index does", () => {
    // Story 2.11 review pass: `PredictPage`'s U15 index is keyed on the
    // lower-cased `full_name`, so a lowercase-typed name reaches this helper
    // holding the right row. A raw-equality arm rejected it and the surface fell
    // back to the initialism the row exists to replace.
    expect(getTeamCode("boston celtics", celticsRow)).toBe("BOS");
    expect(getTeamCode("  SEATTLE superSonics ", sonicsRow)).toBe("SEA");
  });

  it("never prints a blank cell: an empty abbreviation falls through", () => {
    expect(getTeamCode("Seattle SuperSonics", { ...sonicsRow, abbreviation: "" })).toBe("SS");
    expect(getTeamCode("Team A", { ...sonicsRow, full_name: 'Team A', abbreviation: "" })).toBe("TMA");
  });

  it("falls to the placeholder literal, then the name path, with no row at all", () => {
    // The I/O matrix's FK join-miss row: `'Team A'` never reaches the initialism
    // branch, which would print `TA`.
    expect(getTeamCode("Team A")).toBe("TMA");
    expect(getTeamCode("Team B", undefined)).toBe("TMB");
    expect(getTeamCode("Team B", null, undefined)).toBe("TMB");
    // No-row fall-through pin for a name the deleted map used to answer: without
    // a row the name path is honest about it (U15's index is the caller's job).
    expect(getTeamCode("Boston Celtics")).toBe("BC");
    expect(getTeamCode("Boston Celtics", undefined, null)).toBe("BC");
  });

  it("returns a falsy value for blank input so the caller keeps its 'TBD'", () => {
    expect(getTeamCode("")).toBe("");
    expect(getTeamCode("   ")).toBe("");
    expect(getTeamCode("", undefined) || "TBD").toBe("TBD");
  });

  it("carries the two placeholder literals and nothing else", () => {
    // U8: `Team A`/`Team B` are client literals, not `teams` rows (a row each
    // would re-pin `EXPECTED_TEAM_COUNT = 59` for a display convenience). The
    // closed key list is the guard against this map growing back into the one
    // Story 2.11 deleted.
    expect(Object.keys(PLACEHOLDER_ABBREVIATIONS).sort()).toEqual(["Team A", "Team B"]);
    expect(PLACEHOLDER_ABBREVIATIONS).toEqual({ 'Team A': 'TMA', 'Team B': 'TMB' });
  });

  it("leaves no second hardcoded name→code source in the module", () => {
    // AC 5: `TEAM_ABBREVIATIONS` no longer exists, and nothing may re-export it.
    const exports = nbaUtils as unknown as Record<string, unknown>;
    expect(exports.TEAM_ABBREVIATIONS).toBeUndefined();
    expect(exports.getTeamAbbreviation).toBeTypeOf("function");
  });
});

describe("getTeamAbbreviation — the name path, unchanged", () => {
  // What 2.11 leaves the helper for: a fan-typed name with no row behind it.
  // These pins are the ones Story 2.11 kept verbatim.
  it("derives initials from multi-word custom input", () => {
    expect(getTeamAbbreviation("Los Angeles")).toBe("LA");
    expect(getTeamAbbreviation("Foobar McTestface")).toBe("FM");
  });

  it("truncates single-word nickname input (full nickname mapping is the app's job)", () => {
    expect(getTeamAbbreviation("Celtics")).toBe("CEL");
  });

  it("returns a falsy value for unknown/blank input so the UI falls back to 'TBD'", () => {
    // PredictPage.tsx renders `getTeamCode(name, …) || 'TBD'`;
    // the util itself has no literal 'TBD' branch.
    expect(getTeamAbbreviation("")).toBe("");
    expect(getTeamAbbreviation("   ")).toBe("");
    expect(getTeamAbbreviation("") || "TBD").toBe("TBD");
  });
});

describe("getRoundImportance", () => {
  it("ranks rounds by significance (pipeline round vocabulary)", () => {
    expect(getRoundImportance("NBA Finals")).toBe(4);
    expect(getRoundImportance("West Conf Finals")).toBe(3);
    expect(getRoundImportance("East Conf Semifinals")).toBe(2);
    expect(getRoundImportance("First Round")).toBe(1);
  });

  it("returns 0 for unknown rounds", () => {
    expect(getRoundImportance("Preseason")).toBe(0);
  });

  it("ranks the full issue-#3 round vocabulary after the Story 1.4 branch-order fix", () => {
    // The two shipped defects, now closed: a bare 'Semifinals' ranked 4
    // (it matched the bare-finals branch) and 'Conference Finals' ranked 0
    // ('con**fer**ence' contains 'conf', so it matched neither old branch).
    expect(getRoundImportance("Conference Finals")).toBe(3);
    expect(getRoundImportance("Semifinals")).toBe(2);
    expect(getRoundImportance("Conference Semifinals")).toBe(2);
    // Every value the data already produced correctly must come back unchanged.
    expect(getRoundImportance("NBA Finals")).toBe(4);
    expect(getRoundImportance("West Conf Finals")).toBe(3);
    expect(getRoundImportance("East Conf Semifinals")).toBe(2);
    expect(getRoundImportance("First Round")).toBe(1);
    expect(getRoundImportance("Preseason")).toBe(0);
  });
});
