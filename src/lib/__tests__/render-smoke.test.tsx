// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function TeamChip({ name }: { name: string }) {
  return <button type="button">Team {name}</button>;
}

// Harness proof only (Story 1.1): React 18 + RTL + jsdom + jest-dom must wire
// together under Vite 8. Real component regression tests land in Story 1.4.
// Story 2.11 decoupled this file from `getTeamAbbreviation`: the chip used to
// render the helper's output and then assert `getByRole('button', { name: 'Team
// BOS' })`, which (a) made a harness-proof case a hidden consumer of the
// name→code map this story deleted, and (b) asserted a *computed accessible
// name* — the exact thing AGENTS.md · Evidence discipline forbids in jsdom,
// because `dom-accessibility-api` inserts a separator Chrome's accname does not
// (qa-matrix-1-5.md §5 note 4, finding F16). What is pinned here is the raw
// `textContent` concatenation, which is what the harness was ever meant to
// prove: React rendered the tree, RTL can query it, jest-dom matches on it.
describe("render smoke", () => {
  it("renders a React component under jsdom with jest-dom and RTL wired", () => {
    render(<TeamChip name="Boston Celtics" />);

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button.textContent).toBe("Team Boston Celtics");
    expect(button).toHaveTextContent("Team Boston Celtics");
  });
});
