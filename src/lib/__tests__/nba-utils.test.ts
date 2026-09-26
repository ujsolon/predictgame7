import { describe, expect, it } from "vitest";

// Alias import (`@/`) instead of a relative path proves alias resolution
// works inside the Vitest test graph.
import { getRoundImportance, getTeamAbbreviation } from "@/lib/nba-utils";

describe("getTeamAbbreviation", () => {
  it("maps a full team name to its abbreviation", () => {
    expect(getTeamAbbreviation("Boston Celtics")).toBe("BOS");
    expect(getTeamAbbreviation("Denver Nuggets")).toBe("DEN");
  });

  it("passes an abbreviation through unchanged", () => {
    expect(getTeamAbbreviation("BOS")).toBe("BOS");
    expect(getTeamAbbreviation("GSW")).toBe("GSW");
  });

  it("derives initials from multi-word custom input", () => {
    expect(getTeamAbbreviation("Los Angeles")).toBe("LA");
    expect(getTeamAbbreviation("Foobar McTestface")).toBe("FM");
  });

  it("truncates single-word nickname input (full nickname mapping is the app's job)", () => {
    expect(getTeamAbbreviation("Celtics")).toBe("CEL");
  });

  it("returns a falsy value for unknown/blank input so the UI falls back to 'TBD'", () => {
    // PredictPage.tsx renders `getTeamAbbreviation(name) || 'TBD'`;
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
