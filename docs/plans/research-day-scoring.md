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


## Scoring audit log

Layout: read 64 scoring row(s).
Layout: columns A-E = PRESENTER, TITLE, GROUP, CATEGORY, CRITERION.
Layout: judge columns F onward = JUDGE 1 SCORE C Stathis, JUDGE 2 SCORE Poppy, JUDGE 3 SCORE Maria, JUDGE 4 SCORE Anastasiia, JUDGE 5 SCORE Gina, JUDGE 6 SCORE Ashwini, JUDGE 7 SCORE.
Layout: grouped rows into 16 presenter/title block(s), expecting 4 criteria per block.

Step 1 - One number per judge, per presenter
For each presenter and judge, averaged that judge's non-blank criterion scores across the four rows.
- Gabriela Martinez Loyola: raw mean=3.0000; JUDGE 2 SCORE Poppy=3.0000; JUDGE 4 SCORE Anastasiia=3.0000; JUDGE 5 SCORE Gina=3.0000; JUDGE 6 SCORE Ashwini=3.0000
- Yeva Gevorgyan: raw mean=2.7083; JUDGE 2 SCORE Poppy=2.7500; JUDGE 3 SCORE Maria=2.8750; JUDGE 4 SCORE Anastasiia=2.5000
- Malachy Bodak: raw mean=2.6667; JUDGE 2 SCORE Poppy=3.0000; JUDGE 3 SCORE Maria=2.7500; JUDGE 4 SCORE Anastasiia=2.2500
- Ava Omidi: raw mean=2.6250; JUDGE 2 SCORE Poppy=3.0000; JUDGE 4 SCORE Anastasiia=2.5000; JUDGE 5 SCORE Gina=2.7500; JUDGE 6 SCORE Ashwini=2.2500
- Llewellyn Duncan: raw mean=2.5625; JUDGE 2 SCORE Poppy=2.5000; JUDGE 4 SCORE Anastasiia=3.0000; JUDGE 5 SCORE Gina=1.7500; JUDGE 6 SCORE Ashwini=3.0000
- Richard Martinez Loyola: raw mean=2.5625; JUDGE 2 SCORE Poppy=2.7500; JUDGE 4 SCORE Anastasiia=2.5000; JUDGE 5 SCORE Gina=2.2500; JUDGE 6 SCORE Ashwini=2.7500
- Jaren Tasmin: raw mean=2.5313; JUDGE 1 SCORE C Stathis=2.2500; JUDGE 3 SCORE Maria=2.6250; JUDGE 5 SCORE Gina=2.5000; JUDGE 6 SCORE Ashwini=2.7500
- Kateryna Hanhur: raw mean=2.3750; JUDGE 2 SCORE Poppy=2.2500; JUDGE 3 SCORE Maria=2.6250; JUDGE 4 SCORE Anastasiia=2.2500
- Denisse Ramos: raw mean=2.3125; JUDGE 1 SCORE C Stathis=2.2500; JUDGE 3 SCORE Maria=2.5000; JUDGE 5 SCORE Gina=2.0000; JUDGE 6 SCORE Ashwini=2.5000
- Mariana Vasilita: raw mean=2.2188; JUDGE 1 SCORE C Stathis=2.2500; JUDGE 3 SCORE Maria=2.3750; JUDGE 5 SCORE Gina=1.7500; JUDGE 6 SCORE Ashwini=2.5000
- Anik Rahman: raw mean=2.1875; JUDGE 2 SCORE Poppy=2.2500; JUDGE 4 SCORE Anastasiia=2.0000; JUDGE 5 SCORE Gina=2.2500; JUDGE 6 SCORE Ashwini=2.2500
- Maureen Sam-Okomgboeso: raw mean=2.0000; JUDGE 1 SCORE C Stathis=2.0000; JUDGE 3 SCORE Maria=2.2500; JUDGE 5 SCORE Gina=2.2500; JUDGE 6 SCORE Ashwini=1.5000
- Samuel Makaron: raw mean=1.7917; JUDGE 2 SCORE Poppy=1.5000; JUDGE 3 SCORE Maria=2.3750; JUDGE 4 SCORE Anastasiia=1.5000
- Teneesha Young: raw mean=1.7813; JUDGE 1 SCORE C Stathis=1.7500; JUDGE 3 SCORE Maria=1.8750; JUDGE 5 SCORE Gina=2.0000; JUDGE 6 SCORE Ashwini=1.5000
- Josephine Erlenbach: raw mean=1.3750; JUDGE 2 SCORE Poppy=1.2500; JUDGE 4 SCORE Anastasiia=1.5000; JUDGE 5 SCORE Gina=1.2500; JUDGE 6 SCORE Ashwini=1.5000
- Ashley Marte: raw mean=N/A; no judge scores

Step 2 - Adjust for judge leniency
Normalization method selected: MEAN-CENTERING.
- JUDGE 1 SCORE C Stathis: presenter scores=5, mean=2.1000, stddev=0.2000
- JUDGE 2 SCORE Poppy: presenter scores=10, mean=2.4250, stddev=0.5921
- JUDGE 3 SCORE Maria: presenter scores=9, mean=2.4722, stddev=0.2812
- JUDGE 4 SCORE Anastasiia: presenter scores=10, mean=2.3000, stddev=0.4975
- JUDGE 5 SCORE Gina: presenter scores=11, mean=2.1591, stddev=0.4680
- JUDGE 6 SCORE Ashwini: presenter scores=11, mean=2.3182, stddev=0.5548

Step 3 - Final score per presenter
Averaged each presenter's adjusted values across judges who scored them.
- Gabriela Martinez Loyola: adjusted=0.6994, raw mean=3.0000, judges=4
- Ava Omidi: adjusted=0.3244, raw mean=2.6250, judges=4
- Yeva Gevorgyan: adjusted=0.3093, raw mean=2.7083, judges=3
- Jaren Tasmin: adjusted=0.2689, raw mean=2.5313, judges=4
- Malachy Bodak: adjusted=0.2676, raw mean=2.6667, judges=3
- Llewellyn Duncan: adjusted=0.2619, raw mean=2.5625, judges=4
- Richard Martinez Loyola: adjusted=0.2619, raw mean=2.5625, judges=4
- Denisse Ramos: adjusted=0.0501, raw mean=2.3125, judges=4
- Kateryna Hanhur: adjusted=-0.0241, raw mean=2.3750, judges=3
- Mariana Vasilita: adjusted=-0.0436, raw mean=2.2188, judges=4
- Anik Rahman: adjusted=-0.1131, raw mean=2.1875, judges=4
- Maureen Sam-Okomgboeso: adjusted=-0.2624, raw mean=2.0000, judges=4
- Teneesha Young: adjusted=-0.4811, raw mean=1.7813, judges=4
- Samuel Makaron: adjusted=-0.6074, raw mean=1.7917, judges=3
- Josephine Erlenbach: adjusted=-0.9256, raw mean=1.3750, judges=4
- Ashley Marte: adjusted=N/A, raw mean=N/A, judges=0

Step 4 - Award pools
- Undergraduate Live: 4 scored presenter(s), 3 prize(s) configured
- Graduate: 7 scored presenter(s), 2 prize(s) configured
- Pre-recorded: 4 scored presenter(s), 1 prize(s) configured

Step 5 - Rank within each pool
Sorted by adjusted score descending, then raw Overall Impression, then raw Research Quality & Significance.
- Undergraduate Live: 1. Yeva Gevorgyan; 2. Kateryna Hanhur; 3. Samuel Makaron; 4. Josephine Erlenbach
- Graduate: 1. Gabriela Martinez Loyola; 2. Ava Omidi; 3. Malachy Bodak; 4. Richard Martinez Loyola; 5. Llewellyn Duncan; 6. Mariana Vasilita; 7. Anik Rahman
- Pre-recorded: 1. Jaren Tasmin; 2. Denisse Ramos; 3. Maureen Sam-Okomgboeso; 4. Teneesha Young
Tie-break comparisons needed: 1.
- Graduate: Richard Martinez Loyola vs Llewellyn Duncan used Overall Impression (adjusted=0.2619, overall 2.7500 vs 2.5000, research 2.5000 vs 2.2500)

Final ranked output
Normalization method used: MEAN-CENTERING

Undergraduate Live
rank | presenter | adjusted score | raw mean | judges | prize
--- | --- | ---: | ---: | ---: | ---
1 | Yeva Gevorgyan | 0.3093 | 2.7083 | 3 | $150
2 | Kateryna Hanhur | -0.0241 | 2.3750 | 3 | $100
3 | Samuel Makaron | -0.6074 | 1.7917 | 3 | $50
4 | Josephine Erlenbach | -0.9256 | 1.3750 | 4 | 

Graduate
rank | presenter | adjusted score | raw mean | judges | prize
--- | --- | ---: | ---: | ---: | ---
1 | Gabriela Martinez Loyola | 0.6994 | 3.0000 | 4 | $100
2 | Ava Omidi | 0.3244 | 2.6250 | 4 | $50
3 | Malachy Bodak | 0.2676 | 2.6667 | 3 | 
4 | Richard Martinez Loyola | 0.2619 | 2.5625 | 4 | 
5 | Llewellyn Duncan | 0.2619 | 2.5625 | 4 | 
6 | Mariana Vasilita | -0.0436 | 2.2188 | 4 | 
7 | Anik Rahman | -0.1131 | 2.1875 | 4 | 

Pre-recorded
rank | presenter | adjusted score | raw mean | judges | prize
--- | --- | ---: | ---: | ---: | ---
1 | Jaren Tasmin | 0.2689 | 2.5313 | 4 | $150
2 | Denisse Ramos | 0.0501 | 2.3125 | 4 | 
3 | Maureen Sam-Okomgboeso | -0.2624 | 2.0000 | 4 | 
4 | Teneesha Young | -0.4811 | 1.7813 | 4 | 

Winners summary
- Undergraduate Live 1: Yeva Gevorgyan ($150)
- Undergraduate Live 2: Kateryna Hanhur ($100)
- Undergraduate Live 3: Samuel Makaron ($50)
- Graduate 1: Gabriela Martinez Loyola ($100)
- Graduate 2: Ava Omidi ($50)
- Pre-recorded 1: Jaren Tasmin ($150)

Flags

Z-score fallback judges:
- None

Inconsistent Category or Group across presenter rows:
- None

Pools with fewer scored presenters than prizes:
- None

Presenters with no scores at all:
- Ashley Marte

Unresolved ties after all tie-breakers:
- None

Other data quality checks:
- [judge-coverage] JUDGE 7 SCORE: no scores found in this sheet