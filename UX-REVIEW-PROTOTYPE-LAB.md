# Prototype Lab UX review — default and mixed views

Question: how can a reviewer move from evaluating the retained directions to adopting one prototype,
or a deliberate mixture of their sections, without turning the research controls
into permanent dashboard clutter?

## Findings

1. **Evaluation has no decision point.** Opening and commenting on a variant are
   supported, but there is no explicit “use this when the monitor starts” action.
2. **Two floating control groups compete.** Variant navigation and research tools
   live in separate bottom bars. Their hierarchy becomes especially unclear in
   the native widget-size window.
3. **A URL is mistaken for a preference.** A variant URL is shareable, but it
   cannot express a durable local choice and should not be overloaded to do so.
4. **The comparison is descriptive, not actionable.** It presents comments and
   activity but cannot adopt a candidate directly.
5. **Borrowing across variants remains prose.** Reviewers can say “timeline from
   B, system state from C,” but the tool cannot encode or preview that decision.
6. **Personal configuration and research evidence need different boundaries.**
   Layout defaults belong to this Mac and must not silently travel in colleague
   review bundles.
7. **Classic-monitor escape must remain explicit.** Once a prototype is the
   startup default, users still need a reliable route back to the existing view.
8. **The native first viewport hides the primary signal.** At the app's compact
   width, stacked investigation controls push usage-over-time below the fold,
   even though spotting a spike is the monitor's first job.

## Changes driven by the review

- Consolidate adoption and composition under one **Default view** control.
- Persist a local-only preferred view with three modes: classic, variant, custom.
- Add **Use as default** to each comparison candidate.
- Add a composition studio with ordered section rows, retained source choices, and
  required usage/evidence/system sections.
- Render the custom view from the same live model and action bindings as the retained directions.
- Redirect a plain `/monitor/` launch to the preference while preserving an
  explicit `?surface=classic` escape.
- Keep preference data out of exported review bundles.
- Collapse the shared investigation deck at compact widths, retaining a visible
  event/filter summary and one-click access to every control so the first usage
  graph remains in the native app's initial viewport.

## LAB control audit

1. **Native entry was duplicated in the page.** The native LAB surface toggle
   and dashboard Prototype lab link had the same destination. Keep the link for
   browser users and hide it when the native WebView marker is present.
2. **The black footer only looked unified.** Prototype navigation and research
   actions came from separate renderers and split apart at compact widths.
   Replace both with one dock owned by the review layer.
3. **Export lost its quick route.** It remained inside Compare, but portable
   colleague review is a primary workflow. Keep Comment, Compare, Export, and
   Default as four equally presented actions.
4. **A fixed evaluation control obscures the thing being evaluated.** Make the
   dock draggable, clamp it to the viewport, remember its local position, allow
   keyboard nudging, and provide a clear double-click/Home reset.
5. **Compact styling exposed different control families.** Use one border,
   height, typography, focus treatment, and hover language; reflow the same dock
   into two rows rather than splitting it into independent controls.
6. **Saving a style did not visibly adopt it.** Preference persistence alone is
   not enough: staying in LAB leaves the evaluation chrome in place, while the
   native MONITOR action previously forced the Classic surface. Treat LAB and
   the preferred monitor as separate surfaces. Saving now enters the preferred
   style immediately, without the LAB dock; MONITOR follows the preference,
   LAB restores evaluation controls, and Classic remains an explicit menu item.

## Legibility and information hierarchy pass

The prototype family now shares an explicit reading contract:

- 12px is the absolute floor for annotations, units, evidence state, chart text,
  and metadata; interactive controls use at least 13px and explanatory prose
  uses 14px.
- Exact values, units, operational status, evidence identity, and action labels
  always remain visible. They are never treated as secondary decoration.
- Every monitor direction, including the live Classic/A0 mount and mixed views,
  exposes a persistent **Reading detail** control. **Essential** removes only
  optional orientation, methodology, and scoring explanations; **Full** restores
  them. The choice is local to the browser, and compact screens start in
  Essential mode until the user chooses otherwise.
- Review and composition controls follow the same legibility floor so the LAB
  never asks reviewers to evaluate readable UI through unreadable tooling.
- Keyboard focus is made deliberately visible with a three-pixel outline across
  prototypes and LAB controls.
