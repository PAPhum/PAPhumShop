# SDD ledger — plan: docs/superpowers/plans/2026-11-18-installment-pin-perf.md

Spec: docs/superpowers/specs/2026-11-18-installment-pin-perf-design.md (approved 2026-11-18; per-account free/down model)

## Environment rulings

- Ruling: workspace adapts to a non-git project — no commits, no git-based review packages. Implementers close with Checkpoint gates (`npx tsc --noEmit`, `npx vitest run`, `npm run build` where the task says so) and list every changed file in their report; reviewers read those files directly. — Reason: the project is not a git repository and `git init` would be an unrequested side effect. — Cost if wrong: reviewers see file contents rather than a diff, so unrelated pre-existing issues may be reported as new (adjudicated by the controller).
- Baseline: `npm run lint` has 15 pre-existing errors (react-hooks rules + `.opencode/**`). Do not touch `.opencode/`.
- Briefs live in `.superpowers/sdd/2026-11-18-installment-pin-perf/task-N-brief.md`; reports go beside them as `task-N-report.md`.

## Preflight scan (before Task 1)

| Tasks | Shared file / interface | Producer → consumer | Finding |
|---|---|---|---|
| 1 → 2 | `src/lib/installment.ts` constants | exports `WEEKLY_INTEREST_RATE`/`MONTHLY_INTEREST_RATE` → imported by config | OK (lines 3-4 exist) |
| 1 → 3 | `InstallmentInput.weeklyRate/monthlyRate` | Task 1 adds → Task 3 passes | OK |
| 1 self | tests vs code | tests assert `interestRatePerPeriod` 200 / `totalInterest` 400 | OK — field exists at `installment.ts:24`, formula `chargeablePeriods * rate` |
| 2 → 3 | `resolveInstallmentRates` | Task 2 produces → Task 3 consumes | OK; Task 3 must NOT use `resolveMinDown` (removed in the per-account revision) |
| 3 → 5 | `src/app/id/[code]/page.tsx` + `AccountDetailClient` | Task 3 edits client; Task 5 edits server query | OK — view exposes `interest_free_*`, `min_down_*`, `gallery_urls` (DB.md:116) |
| 4 → 12 | `store/page.tsx` query + `StoreAccount` | Task 4 writes query → Task 12 moves it into `getStoreData` | OK, sequential |
| 4 → 13 | `AccountCatalogClient` | Task 4 props → Task 13 images | OK, sequential |
| 6 → 7 | `src/components/admin/AdminDashboardClient.tsx` | Task 6 deletes settings inputs (~729-800); Task 7 edits modal props (~860-874) | OK, non-overlapping ranges |
| 6 → 10 | `settings/route.ts`, `accounts` routes | Task 6 business edits; Task 10 swaps `error.message` for helper | OK sequential; Task 10 must preserve Task 6's row check |
| 8 → 9 | `pin-token.ts` / `pin/route.ts` | TTL vs limiter | OK, independent |
| 9 → 10 | `pin/route.ts` | limiter swap then error helper | OK sequential |

Per-task self-agreement: all 14 tasks' tests/steps match their stated files and interfaces; no task mandates a stubbed test or duplicated logic block. Task 1's inline test is appended to an existing file that already imports `{ describe, it, expect } from 'vitest'` — implementer must keep the import and wrap new `it` in the existing `describe` or add one.

Ruling: no blocking conflicts. Task 6 removal of the 4 settings inputs is safe before Task 7 because `settings.default_*` remains in the type and the modal props are only changed in Task 7.

## Progress

- Plan amendment (pre-Task-2): Task 7 now also passes `weeklyRate`/`monthlyRate` into `ScheduleGeneratorModal` because Task 1 found hardcoded 140/600 in its button labels and calculation. `InstallmentCalculator.tsx` also hardcodes them but is **not imported anywhere** (dead component) — left untouched (YAGNI).
- Task 1: implementer reported DONE_WITH_CONCERNS. Fix round 1 dispatched: rename `vitest.config.ts` → `vitest.config.mts` to silence the Vite CJS/ESM warning. Concern 2 handled as the Task 7 amendment above. Concern 3 (npm audit: 15 high, pre-existing) noted, no action.

