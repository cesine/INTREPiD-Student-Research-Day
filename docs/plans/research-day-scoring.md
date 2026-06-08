# Research Day Scoring Script Plan

## Goal
Create a TypeScript script that reads `data.csv`, computes judge-normalized research-day rankings, prints one ranked table per award pool, prints a winners summary, and flags data issues requested by the user.

## Non-goals
- Do not generate final official results outside the script output.
- Do not add package dependencies or a project build system.
- Do not modify `data.csv`.

## Constraints
- Scores are higher-is-better.
- Blank scores are ignored, not counted as zero.
- Default normalization is mean-centering; changing the method to z-score should be a single constant edit.
- Z-score falls back to mean-centering for a judge with one scored presenter or zero/undefined spread.
- Presenter rows are expected to be four criteria rows.

## Acceptance criteria
- Per-judge, per-presenter raw means are averaged over non-blank criteria.
- Judge scores are adjusted within each judge before presenter-level averaging.
- Rankings use adjusted score descending, then raw Overall Impression average, then raw Research Quality & Significance average.
- Output includes adjusted score, raw mean, judge count, rank, presenter, and prize where applicable.
- Output flags fallback z-score judges, inconsistent category/group rows, undersized prize pools, no-score presenters, and unresolved ties.

## Approach
- Implement a dependency-free CSV parser for quoted fields.
- Group records by presenter and title.
- Derive judge columns from headers beginning at column F.
- Calculate criterion-level raw means and judge-level presenter means.
- Normalize judge-level presenter means using a top-level `NORMALIZATION_METHOD`.
- Build pool rankings from scored presenters only, and list no-score presenters separately as warnings.

## Files / areas affected
- `score.ts`
- `docs/plans/research-day-scoring.md`

## Verification plan
- Run the script against the provided `data.csv`.
- Confirm the output includes three award pools, a winners summary, and requested warning sections.
- Inspect the diff to ensure only the planned files changed.

## Test plan
- Before/proof: inspect `data.csv` shape and confirm row count is divisible into four-row presenter blocks.
- Happy path: execute `node --experimental-strip-types score.ts` and review rankings.
- Sad path: rely on current input to exercise no-score presenter warnings and inconsistent category warning.
- After/proof: run `git diff --stat` and inspect the relevant diff.

## Monitoring plan
No runtime monitoring is needed for this local tally script.

## Risks / open questions
- The prompt does not define whether z-score standard deviation should be sample or population; this script uses population standard deviation across each judge's per-presenter scores.
- No-score presenters cannot receive an adjusted score; the script excludes them from prize rankings and flags them.

## Status
- Implemented and verified locally with `node --experimental-strip-types score.ts`, `npm test`, and `npm audit`.
