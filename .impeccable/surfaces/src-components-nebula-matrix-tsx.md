---
version: 1
slug: "src-components-nebula-matrix-tsx"
primary_target: "src/components/nebula-matrix.tsx"
related_targets: ["src/components/orbit.tsx", "src/app/nebula.css", "packages/core/src/orbit-labels.ts"]
---

# Orbit universe home

Mode: Operate. Default after sign-in is the full-screen star map. Management surfaces are reached deliberately through 工作舱; the daily record-and-act loop stays on the map.

## Direction contract

THESIS: A task is a star in the user's attention universe. Completing feeds the sun; deleting disappears into a black hole.

OWN-WORLD: Existing deep navy nebula and coral/lime/violet/cyan priority stars; a warm gold sun and violet accretion disk create distinct action destinations. Space Grotesk, Chinese system text and existing label layout stay coherent.

STORY: Login directly into the map, capture a natural-language task at the bottom, drag to prioritize. Drag into the central sun to complete, into the temporary black hole to delete. Open 工作舱 only for reports, projects, history, settings or workspace switching.

FIRST VIEWPORT: Compact orbit brand / 工作舱 at the top left, small filter, notification, focus and capture controls at the right. No permanent sidebar or management breadcrumb. The coordinate map fills the middle; sun sits exactly on the origin. An independent bottom capture form and map controls remain reachable on phone and desktop.

FORM: Code-led extension of the existing procedural coordinate world; the user's sun/black-hole brief determines the form. The signature response is a curved shrinking stellar flight to the sun or black hole after the server acknowledges success. Failure preserves the item; deletion is undoable and distinct from completion. Reduced motion retains truthful text feedback and removes spatial flight.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Persistent interaction rules

Coordinates and manual quadrant changes remain atomic and persistent. Deadline drift stays inside the assigned quadrant. Callout collision avoidance never modifies stored coordinates. Pointer capture, Escape, pointer cancellation, keyboard Alt+arrow movement and readable two-dimensional mobile mapping remain supported. The central sun owns a reserved label exclusion region. Completed items keep their completion history; deleted items and their child items stop reminding and disappear from ordinary queries. Deletion and restoration are separate audited, versioned, idempotent endpoints. Previously deleted children are not restored incidentally when a parent is restored.
