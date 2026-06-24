# BauCompliance Daily Product Improvement Pipeline

This directory defines the daily autonomous product-improvement workflow for `mjordi/swiss-construction-compliance`.

## Goal

Every day, the pipeline should:

1. **Research** one small (S), one medium (M), and one large/strategic (L) product improvement through a user-and-market lens.
2. **PM-review** those options and decide `APPROVED`, `BACKLOG`, or `REJECTED` using delivery calibration plus a strategic portfolio check.
3. **Engineering** exactly one approved, reviewable improvement and ideally open a PR.

The pipeline is optimized for **reviewable, product-aware improvements that compound toward a best-in-market Swiss construction-compliance product**. It should not default to random feature generation, but it also must not get trapped in only cosmetic or incremental polish.

## Outputs per run

- `proposals/YYYY-MM-DD.md` — daily research proposals
- `decisions/YYYY-MM-DD.md` — PM decision record
- optional implementation branch/commit/PR
- Telegram summary from the autonomous run

## Approval philosophy

The PM step should evaluate:

- business value
- feasibility
- strategic fit
- risk
- phaseability
- user-visible impact
- competitive differentiation / best-product rationale

It must also calibrate scope using the last **7 days of merged PRs**, so that the system does not suddenly approve oversized work when recent throughput has mostly supported small/medium changes.

That calibration is a safety governor, not a permanent ceiling. The PM step must inspect the last **14 days of pipeline decisions** for portfolio drift. If recent approvals are mostly S-sized polish, it should intentionally consider a Medium or phase-1 strategic slice, or explicitly explain why such a slice is not safe today and what prerequisite would make it safe.

## Engineering expectations

If at least one proposal is approved, Engineering should:

- create a branch
- implement exactly one approved proposal
- run relevant validation (`npm run test`, `npm run lint`, `npm run build` best-effort)
- commit changes when validation is in a good state
- attempt to open a PR when environment/auth allow it

If PR creation is not possible in the current environment, the run should explicitly report:

`PR link: Not opened in this cron run`

## Manual run

You can run the workflow manually from the repo root:

```bash
bash scripts/baucompliance-pipeline/run-pipeline.sh
```

## Automation

The canonical autonomous instructions live in:

- `scripts/baucompliance-pipeline/daily-product-improvement-prompt.md`

That prompt is designed to be used by Hermes cron runs or manual Hermes invocations.
