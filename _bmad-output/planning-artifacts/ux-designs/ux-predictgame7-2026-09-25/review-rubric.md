# Spine Pair Review — PredictGame7

Rubric-walker review of `DESIGN.md` + `EXPERIENCE.md` (scoped run: OG share card, `/series/<id>` flagship page, Share button + success states, error/empty states). Checked against `design-md-spec.md`, the shadcn/editorial/mobile examples, `validate.md` lenses 6–8, the four reconcile files, `.memlog.md`, `mockups/`, and the referenced sources (SPEC.md, epics.md, PRD + addendum, ARCHITECTURE-SPINE.md) plus live code (`src/index.css`, `tailwind.config`, `src/components/ui/`).

## Overall verdict

The pair is a coherent, decision-complete contract for the scoped run: every reconcile fix is visibly applied, all owner decisions are committed with dates, tokens are complete with hex, and both spines follow canonical shape. Three mechanical defects block a clean source-extract: all four `sources` paths in EXPERIENCE.md are off one directory level and do not resolve, two of three mockups are orphaned with no "spine wins on conflict" statement, and two component names diverge across the files. All are cheap fixes; none require re-deciding anything.

## 1. Flow coverage — adequate

Checked: in-scope journeys from PRD §2 (UJ-1 Bert, UJ-2 Wang, UJ-3 Rhian) and FR-31/SM-3 against EXPERIENCE.md · Key Flows. Two flows present. Both have a named protagonist, numbered steps, an explicit **Climax** beat, and a Failure path (Flow 1: clipboard-blocked + OG render failure; Flow 2: fetch failure → retry panel → second-failure dead-end rule). Flow 1 covers the share round-trip end-to-end (Share tap → share-og → crawler card → friend arrival → conversion); Flow 2 covers cold traffic on the flagship page (OG stop → orient-in-five-seconds → video → CTA). Error/empty/success states are journey-covered via failure paths + State Patterns rather than dedicated flows — correct for scoped run. The historic-share variant (`?method=` → Predict preloaded, Stories 4.1/4.4) is specced in State Patterns but never flowed; acceptable since only the payload differs from Flow 1.

### Findings

- **medium** Flow-to-UJ labels do not match the source definitions (EXPERIENCE.md · Key Flows, lines 140 and 150; prd.md lines 44–65). Flow 1 tags Bert "UJ-1" but walks him through a **custom matchup** run — that is UJ-2's path; UJ-1 is the historic-series debate whose resolution FR-31 names. Flow 2 tags Rhian "social scroller, UJ-3" but PRD's UJ-3 is the newsletter writer arriving from Google/Reddit via archive → Insights → Maths; a feed-share cold arrival is a new journey, not UJ-3. *Fix:* either relabel (Flow 1 → "UJ-1 resolution via the UJ-2 custom path"; Flow 2 → "cold-arrival journey, adjacent to UJ-3") or re-cast Flow 1 with a historic `/series/<id>?method=` share so the UJ-1 tag is literal. Content is right; the traceability tags are not.
- **low** No flow touches UJ-2's protagonist Wang, though the Share button lives in his climax surface (Predict detailed view) (EXPERIENCE.md · Key Flows; prd.md lines 52–58). *Fix:* covered by the relabel above; a third flow is not warranted at this scope.

## 2. Token completeness — strong

Checked: every YAML frontmatter token in DESIGN.md and every `{path.to.token}` reference in both spines. All 13 color tokens carry hex values — no critical misses. All 9 component-token references (`{colors.primary}`, `{colors.primary-foreground}`, `{colors.muted-foreground}`, `{colors.background}`, `{colors.border}`, `{colors.muted}`, `{colors.destructive}`, `{colors.accent}`, `{rounded.lg}`) resolve against frontmatter. `spacing` as a `note`-only inheritance declaration matches the spec's UI-system-inheritance pattern. Contrast targets are stated for the load-bearing combination: the `#808080` muted-foreground AA failure (~3.9:1), the owner-decided `#767676` (≥4.5:1) tightening, and the large-text/decorative restriction until then — consistently in DESIGN.md · Colors and EXPERIENCE.md · Accessibility Floor. Hex claims verified against `src/index.css` (`--muted-foreground: 0 0% 50%` = #808080 ✓).

### Findings

- **low** `typography.label.textTransform: uppercase` is outside the spec's allowed key subset (`fontFamily/fontSize/fontWeight/lineHeight/letterSpacing`) (DESIGN.md frontmatter, line 43). *Fix:* move the uppercase rule into the `note` field or the Typography prose (where the label motif is already described).
- **low** `typography.mono-data` carries no `fontSize`/`lineHeight`; sizes live only in prose (OG abbreviations 64px, inline errors `text-sm`) (DESIGN.md frontmatter, lines 44–46). Defensible under the platform-convention `note` pattern, but a machine consumer gets no size. *Fix:* add the Tailwind inheritance to the note (e.g. "inherits font-mono; sizes per context") or a default fontSize.
- **low** Two component tokens hold prose instead of values/refs: `og-card.accent: 'team logos only — full color, no treatment'` and `share-button.variant: 'icon-only (ghost)…'` (DESIGN.md frontmatter, lines 62, 67). *Fix:* convert to `note:` fields to stay schema-honest.

## 3. Component coverage — adequate

Checked: every component name used anywhere in either spine, against DESIGN.md · Components (visual) and EXPERIENCE.md · Component Patterns (behavioral). OG card ✓/✓, Share button ✓/✓, Retry panel ✓/✓, Inline field error ✓/✓, Form success confirmation ✓/✓, Empty state ✓/✓ — all with real rules (retry-panel's AD-9 refinement, share-og-never-raw-deep-link, submit-time validation with pre-submission exception, `role="status"` announcements). "Hero skeleton" in State Patterns resolves to the inherited shadcn `Skeleton` (`src/components/ui/skeleton.tsx` exists) — fine under the as-is inheritance clause. Two names fail the identical-across-files test:

### Findings

- **medium** "Series page" (EXPERIENCE.md · Component Patterns, line 72) vs "Series page hero" (DESIGN.md · Components, line 129; frontmatter `series-page-hero`), and "Video embed" (EXPERIENCE.md line 73) vs "Editorial content" (DESIGN.md line 130) — the behavioral rows exist but under different names than the visual specs, so a mechanical name-join misses them (the video-embed visual spec is buried inside "Editorial content"). *Fix:* rename to match — either split "Editorial content" into "Editorial content" + "Video embed" in DESIGN.md, or rename the EXPERIENCE rows; align "Series page" ↔ "Series page hero".
- **low** DESIGN.md frontmatter `components` omits `editorial-content`, `video-embed`, and `form-success-confirmation`, which the Components body specs as brand additions (DESIGN.md lines 57–76 vs 130, 134). They have no token deltas, but the spec's pattern is one frontmatter entry per named component. *Fix:* add minimal entries (or `note`-only entries) for the three.

## 4. State coverage — strong

Checked: every in-scope IA surface (series page, OG card, share affordance) plus the ratified surfaces the new empty-state pattern lands on. Covered in EXPERIENCE.md · State Patterns: cold open from share (with the prerendered no-blank-frame rule), historic share-link arrival (`?method` → client redirect, owner-decided), share-attributed arrival (`utm_source=share`, NFR-V1-only consumption), unknown series id (404 + crawlability constraint), OG render failure (silent fallback), series fetch failure (retry panel + stable hero skeleton), Predict service failure (toast + panel, inputs preserved), share copy success (2s toast), empty Active list, offseason empty Insights. Empty/skeleton behavior for absent editorial sections is covered by the render-only-when-content-exists rule (Component Patterns). No in-scope surface lacks its applicable states.

### Findings

- **low** The clipboard-blocked state ("Couldn't copy — long-press the address bar to share.") exists only in Flow 1's failure line, not in the State Patterns table where a story-dev extracting by table would look (EXPERIENCE.md line 148 vs 82–93). Native-share-sheet dismissal/cancel is also unaddressed anywhere. *Fix:* add a "Share copy failure" row to State Patterns; one clause for sheet-cancel ("no-op; nothing persisted") if wanted.

## 5. Visual reference coverage — thin

Checked: all three files in `mockups/` against inline links from the spines. Only `key-og-card.html` is linked (DESIGN.md · Typography, line 104 — specific: "as mocked", naming the OG type sizes it illustrates). `key-series-page.html` (flagship + bare + 404) and `key-error-states.html` (toasts, retry panel, inline error, empty state) are orphans — no link from either spine. The shadcn example's pattern ("→ Composition reference: `mockups/…`. Spine wins on conflict.") appears nowhere; grep for "wins on conflict" across the folder returns nothing. The memlog records the promotion of all three mocks, so the omission is a linking gap, not a missing artifact.

### Findings

- **high** `mockups/key-series-page.html` and `mockups/key-error-states.html` are not referenced from either spine (folder listing vs EXPERIENCE.md · IA / State Patterns and DESIGN.md · Layout & Spacing / Components). A downstream consumer cannot discover what visual evidence exists for the two surfaces with the most layout risk. *Fix:* add composition-reference lines at the relevant sections — series-page mock at EXPERIENCE · IA or DESIGN · Layout & Spacing (flagship, bare, 404 variants), error-states mock at EXPERIENCE · State Patterns or DESIGN · Components (naming toast/retry/inline/empty coverage).
- **medium** "Spine wins on conflict" is never stated (absent from both files). With three pixel-level HTML mocks in play, precedence is ambiguous — e.g. the mocks predate nothing, but the OG method-label placement is explicitly "re-tunable once seen against the real UI" (DESIGN.md line 128), which needs the precedence rule to be safe. *Fix:* state it once, where the mockups are first linked.

## 6. Bloat & overspecification — strong

Checked both files against the bloat lens. DESIGN.md prose carries editorial voice appropriately ("the drama is in the data", "logos as the color event") — permitted. EXPERIENCE.md prose is functional, not editorial; tables carry the load in IA, Voice, Component Patterns, State Patterns, Responsive. Pixel specs are confined to where tokens genuinely don't reach: the fixed 1200×630 OG canvas (owner-approved sizes, mock-verified) and the safe-zone — justified one-offs, not overspecification of the UI system. No source restatement found: PRD voice anchors are quoted once and used; AD content is referenced by ID, not copied (AD-6's mechanism is summarized in IA, which is load-bearing behavior, not restatement). `[ASSUMPTION]` tags appear exactly twice and both are resolved-elsewhere artifacts (margins → owner-approved in memlog; partner creator → genuinely open business item, correctly flagged).

### Findings

- **low** The retry-panel AD-9 refinement rationale is duplicated near-verbatim in DESIGN.md · Components (line 132) and EXPERIENCE.md · Component Patterns (line 75); it is behavioral, so the DESIGN copy is the redundant one. The contrast decision paragraph is likewise duplicated across DESIGN · Colors (line 96) and EXPERIENCE · Accessibility Floor (line 114) — defensible (each is load-bearing in its own file) but could be one statement + one pointer. *Fix:* trim DESIGN's retry-panel entry to the visual spec + a pointer to EXPERIENCE.

## 7. Inheritance discipline — thin

Checked: `sources` frontmatter resolution, verbatim naming, cross-file component identity, token cross-resolution. The architecture/epic/PRD references all resolve and were verified at source: AD-2/AD-6/AD-7/AD-9 exist in ARCHITECTURE-SPINE.md; CAP-8 exists in SPEC.md §Capabilities; Stories 1.3/3.3/4.1/4.2/4.4 exist in epics.md; the five voice anchors are verbatim from addendum §H (line 128); FR-13's scoped-pilot status matches PRD line 174; `SharePayload`/`contract.ts` matches AD-2's wording (file is planned, not yet created — consistent); `resource-static.bj.bcebos.com` font URL and `darkMode: ['class']` verified in code. EXPERIENCE's token references (`muted-foreground #808080`) resolve to DESIGN tokens by name. But the sources block itself fails:

### Findings

- **high** All four `sources` paths in EXPERIENCE.md frontmatter (lines 5–8) do not resolve. From the spine folder, `../../` lands on `planning-artifacts/`, so `../../specs/spec-predictgame7/SPEC.md` → `planning-artifacts/specs/…` (nonexistent; actual: `_bmad-output/specs/…`) and `../../planning-artifacts/epics.md` → `planning-artifacts/planning-artifacts/epics.md` (nonexistent; actual: `planning-artifacts/epics.md`). Consistent off-by-one: every path needs one more `../` (i.e. `../../../specs/…`, `../../../planning-artifacts/…`) — or the `../../` prefix dropped if the convention is `_bmad-output`-relative. A consumer that source-extracts programmatically gets zero of four. *Fix:* correct the four relative paths.
- **medium** Component names not identical across files — see finding under §3 (Series page / Series page hero; Video embed / Editorial content). Counted once, here for the discipline lens.
- **low** UJ names not fully verbatim in journey content — see finding under §1 (Bert tagged UJ-1 on a UJ-2 path; Rhian's UJ-3 persona re-cast). Persona names themselves (Bert, Rhian) are verbatim; Wang absent.

## 8. Shape fit — strong

Checked: DESIGN.md section order against the canonical list — Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts. All eight present, exact canonical order, none invented. EXPERIENCE.md required defaults — Foundation ✓, Information Architecture ✓, Voice and Tone ✓, Component Patterns ✓, State Patterns ✓, Interaction Primitives ✓, Accessibility Floor ✓, Key Flows ✓. Required-when-applicable: Responsive & Platform present and triggered (three breakpoints + the OG fixed-canvas exception); Inspiration & Anti-patterns present and triggered (The Athletic lift; four recorded rejects including the owner-parked social-temperature widget, matching memlog). Frontmatter shapes match the examples (DESIGN: name/description/tokens; EXPERIENCE: name/status/sources/updated). No findings.

## Mechanical notes

- **Frontmatter:** EXPERIENCE.md `status: draft` — must flip to `final` at this Finalize gate. DESIGN.md carries no `sources`/`status` — matches design-example-shadcn.md, not required by design-md-spec.md. EXPERIENCE.md frontmatter has no explicit scope field; the scoped-run boundary lives in the title blockquote — readable, but a machine consumer gets scope only from prose.
- **Broken cross-refs:** the four `sources` paths (§7 finding). All other cross-references verified resolving: AD-2/6/7/9 → ARCHITECTURE-SPINE.md; CAP-7/CAP-8 → SPEC.md; Stories 1.3/3.3/4.1/4.2/4.4 → epics.md; FR-13/FR-25/FR-31/SM-3/NFR-A1/NFR-U1/NFR-V1/PRD §7 → prd.md; addendum §H anchors → addendum.md line 128.
- **Name inconsistencies:** "Series page" vs "Series page hero"; "Video embed" vs "Editorial content" (see §3). "sonner" capitalized "Sonner Toaster" in DESIGN vs lowercase elsewhere — trivial. Frontmatter component keys (kebab) vs body names (prose case) follow the Drift example convention — fine.
- **Factual drift:** DESIGN.md · Components says "51 components in `src/components/ui/`"; the directory holds 50. Cosmetic, but it is the kind of number a consumer might trust.
- **Stale source (known, not a spine defect):** SPEC.md line 56 still lists video FR-13 as PLANNED-GATED, contradicting PRD's scoped-pilot status (owner decision 2026-09-25) that both spines build on. Memlog line 18 already flags "offer SPEC update at close" — that offer should be honored before downstream consumers read SPEC as authority.
- **Planned-file references:** `supabase/functions/_shared/contract.ts` and the `share-og` function do not exist yet; both are correctly framed as architecture-owned deliverables (AD-2/AD-3, Story 4.2), not as current code. No action.
- **Assumption hygiene:** memlog records all four draft assumptions resolved by the owner (2026-09-25); the two surviving `[ASSUMPTION]` tags in DESIGN.md (OG margins — since owner-approved; partner creator credit string — genuinely open business item) are consistent with that record, though the OG-margins tag could now be retired.
