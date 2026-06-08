Research-day judging scoring

LAYOUT
Each presenter occupies 4 rows — one per criterion (Organization & Visuals,
Communication & Delivery, Research Quality & Significance, Overall Impression).
Columns: A = Presenter, B = Title, C = Group (LIVE or PRERECORDED),
D = Category (undergrad or graduate), E = Criterion, and F onward = one column
per judge (JUDGE 1 SCORE … JUDGE 7 SCORE).
Scores are 1 = good, 2 = very good, 3 = outstanding; HIGHER IS BETTER.
A blank cell means that judge did not score that item — ignore blanks, do NOT
count them as zero.

WHY NORMALIZE: The live presentations ran in two sessions with slightly different
judge panels (two judges shared, one different per session). To keep presenters
from different sessions comparable, adjust for how lenient or harsh each judge is
before combining scores.

NORMALIZATION METHOD = MEAN-CENTERING ← (to switch, change to "Z-SCORE")

STEP 1 — One number per judge, per presenter
For each presenter and each judge who scored them, average that judge's non-blank
scores across the four criteria. This gives a single raw score per (judge, presenter).

STEP 2 — Adjust for judge leniency (within each judge)
For each judge, take all their per-presenter scores from Step 1 and:
  • MEAN-CENTERING (default): subtract that judge's own overall mean from each of
    their scores. (Result is centered on 0; negative = below that judge's average.)
  • Z-SCORE (only if selected): subtract the judge's mean AND divide by the judge's
    standard deviation.
SAFEGUARD: If a judge's standard deviation is 0 or they scored only one presenter,
do NOT z-score them — fall back to mean-centering for that judge (and note it).

STEP 3 — Final score per presenter
For each presenter, average their adjusted values from Step 2 across all judges who
scored them. This adjusted average is what you rank on. Also report the presenter's
RAW mean (Step 1 averaged across judges) alongside it, for interpretability.

STEP 4 — Sort into three award pools
- Undergraduate Live = Group LIVE and Category undergrad
- Graduate = Category graduate (ANY group — includes the one
                        pre-recorded graduate)
- Pre-recorded = Group PRERECORDED and Category undergrad

STEP 5 — Rank within each pool (highest adjusted score first) and assign prizes
- Undergraduate Live: 1st $150, 2nd $100, 3rd $50
- Graduate: top presentation only, $150
- Pre-recorded: 1st $100, 2nd $50
Break ties by the raw Overall Impression average, then raw Research Quality &
Significance; if still tied, flag it for me to decide.

OUTPUT
One ranked table per pool: rank, presenter, adjusted score, raw mean, number of
judges who scored them, and prize where applicable. Then a short winners summary,
and state which normalization method was used.

ALSO FLAG
- Any judge who fell back to mean-centering because of zero/undefined spread.
- Any presenter whose Category or Group is not identical across all four of their rows.
- Any pool with fewer presenters than prizes.
- Any presenter with no scores at all.