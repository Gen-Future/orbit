---
version: 1
slug: 'src-components-capture-review-tsx'
primary_target: 'src/components/capture-review.tsx'
related_targets: ['src/components/orbit.tsx', 'src/app/capture.css']
---

# Orbit capture confirmation

Mode: Operate. Local extension of Orbit's existing capture drawer, not a new visual world. Users confirm a natural-language task frequently on desktop and phone.

## Direction contract

THESIS: Read the task, choose its home, confirm. A pending AI draft must be able to enter any quadrant with one visible choice.
OWN-WORLD: Preserve Orbit deep ink, lime primary action, coral/lime/violet/cyan quadrant semantics, Space Grotesk and Chinese system fonts. No decorative galaxy inside the drawer.
STORY: Editable task title leads; a compact four-quadrant destination selector mirrors the map's Q3/Q1, Q4/Q2 arrangement. Inbox stays a separate deliberate choice. Date/project summary follows, expanded fields remain secondary.
FIRST VIEWPORT: Fixed concise header, task title, clearly actionable four-cell destination map and inbox row, optional date/project summary, collapsed details. Bottom confirmation stays reachable independently of content scroll. Mobile has the same hierarchy and full-width action footer with safe-area padding.
FORM: Code-led local replacement of capture composition. Selecting a quadrant updates triageStatus and quadrant together; selection changes the save action and destination summary. Native radios support keyboard navigation. Retry, local draft recovery, batch selection, explicit edits, reduced motion and error recovery remain intact.
FINISH: Desktop/mobile single and batch screenshot evidence, real saved quadrant/pending state verification, independent finish reviewer and documenter. No new raster assets or global system change.

Constraints: Keep uncertain AI drafts visibly uncertain; do not auto-classify them merely to show them on the map. Single and batch confirmation share the destination control. Existing task decomposition keeps its explicitly bounded edit behavior.

## Built evidence · 2026-10-12

- Single and batch confirmation share `CaptureTitle`, `CaptureDestination` and `CaptureFields`. The editable title wraps and grows; date/project summaries remain readable above the collapsed detail fields and AI rationale. Clarification and similar-item links remain available.
- The native radio group presents Q3/Q1 above Q4/Q2, with quadrant names, importance/urgency text and a selected check. Choosing a quadrant sets `triageStatus: 'triaged'` and `quadrant` together; the separate Inbox choice sets `triageStatus: 'pending'`. Saving follows the user's choice; uncertain drafts are not automatically classified.
- Desktop width is capped at 600px; at 700px and below the drawer fills the width. Header and save footer remain outside the independently scrolling body. The footer announces the single destination or batch quadrant/Inbox counts; mobile includes safe-area padding and a flexible primary action. Expanded mobile fields use 16px text. Existing dialog focus containment/restoration and reduced-motion behavior are retained.
- Batch rows keep individual editing and deselection. Local recovery retains edits, destinations and selection; save failure retains the draft and supports idempotent retry. AI retry preserves an edited destination as a `triageStatus`/`quadrant` pair. Existing-item decomposition keeps its prior opt-in detail boundary.
- Visual evidence: [.impeccable/review/capture-review-1440.png](../review/capture-review-1440.png), [capture-review-390.png](../review/capture-review-390.png), [capture-batch-review-1440.png](../review/capture-batch-review-1440.png), [capture-batch-review-390.png](../review/capture-batch-review-390.png). Screenshots cover single/batch at 1440×844 and 390×844; independent finish review returned `ship`.
- Validation: 32 core tests, six related Playwright flows, production build and format checks passed. Browser coverage verifies all four saved quadrant states, explicit Inbox saving, batch deselection, reload recovery, keyboard selection, reachable footer and failure retry. AI responses were mocked; capture storage used an independent PostgreSQL test database. Live AI output quality was not verified; this change was not deployed.

This ordinary extension preserves root `DESIGN.md` and `.impeccable/design.json`. Capture styles stay local to this surface; no global tokens or visual-world decisions were revised.
