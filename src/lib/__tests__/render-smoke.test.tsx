// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getTeamAbbreviation } from "@/lib/nba-utils";

function TeamChip({ name }: { name: string }) {
  return <button type="button">Team {getTeamAbbreviation(name)}</button>;
}

// Harness proof only (Story 1.1): React 18 + RTL + jsdom + jest-dom must wire
// together under Vite 8. Real component regression tests land in Story 1.4.
describe("render smoke", () => {
  it("renders a React component under jsdom with jest-dom and RTL wired", () => {
    render(<TeamChip name="Boston Celtics" />);

    const button = screen.getByRole("button", { name: "Team BOS" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Team BOS");
  });
});
