import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type NormalizationMethod = "MEAN-CENTERING" | "Z-SCORE";

const NORMALIZATION_METHOD: NormalizationMethod = "MEAN-CENTERING";
const DATA_FILE = "data.csv";
const EXPECTED_CRITERIA = [
  "Organization & Visuals",
  "Communication & Delivery",
  "Research Quality & Significance",
  "Overall Impression",
] as const;
const EXPECTED_FIRST_COLUMNS = ["PRESENTER", "TITLE", "GROUP", "CATEGORY", "CRITERION"];
const VALID_GROUPS = new Set(["LIVE", "PRERECORDED"]);
const VALID_CATEGORIES = new Set(["undergrad", "graduate"]);
const VALID_CRITERIA = new Set<string>(EXPECTED_CRITERIA);
const CLOSE_MARGIN_THRESHOLD = 0.01;
const JUDGE_DISAGREEMENT_THRESHOLD = 0.75;

const POOLS = [
  {
    name: "Undergraduate Live",
    prizes: ["$150", "$100", "$50"],
    includes: (presenter: PresenterSummary) =>
      presenter.group === "LIVE" && presenter.category === "undergrad",
  },
  {
    name: "Graduate",
    prizes: ["$100", "$50", "$50"],
    includes: (presenter: PresenterSummary) => presenter.category === "graduate",
  },
  {
    name: "Pre-recorded",
    prizes: ["$150"],
    includes: (presenter: PresenterSummary) =>
      presenter.group === "PRERECORDED" && presenter.category === "undergrad",
  },
];

export type CsvRecord = Record<string, string>;

type PresenterGroup = {
  key: string;
  presenter: string;
  title: string;
  rows: CsvRecord[];
};

export type PresenterSummary = {
  key: string;
  presenter: string;
  title: string;
  group: string;
  category: string;
  groupsSeen: string[];
  categoriesSeen: string[];
  criterionScores: Map<string, number[]>;
  rawOverallAverage: number | null;
  rawResearchAverage: number | null;
  judgeRawScores: Map<string, number>;
  adjustedScore: number | null;
  rawMean: number | null;
  judgeCount: number;
};

export type JudgeStats = {
  judge: string;
  mean: number;
  standardDeviation: number | null;
  scoreCount: number;
  usedFallback: boolean;
};

export type RankingRow = PresenterSummary & {
  rank: number;
  prize: string;
};

export type TieBreakReason =
  | "Overall Impression"
  | "Research Quality & Significance"
  | "Unresolved";

export type TieBreakAudit = {
  poolName: string;
  presenterA: string;
  presenterB: string;
  reason: TieBreakReason;
  adjustedScore: number;
  overallA: number | null;
  overallB: number | null;
  researchA: number | null;
  researchB: number | null;
};

export type DataQualityIssue = {
  kind:
    | "layout"
    | "required-field"
    | "metadata"
    | "criteria"
    | "score"
    | "judge-coverage";
  message: string;
};

export type PrizeCutoffReview = {
  poolName: string;
  lastPrizeRank: number;
  lastPrizePresenter: string;
  nextPresenter: string;
  margin: number;
  isClose: boolean;
  recommendation: string;
};

export type JudgeDisagreementReview = {
  presenter: string;
  centeredMin: number;
  centeredMax: number;
  centeredRange: number;
  judgeCount: number;
  isHighDisagreement: boolean;
  recommendation: string;
};

export type ScoreResult = {
  normalizationMethod: NormalizationMethod;
  presenterSummaries: PresenterSummary[];
  rankings: Map<string, RankingRow[]>;
  winners: string[];
  judgeStats: JudgeStats[];
  inconsistentPresenters: PresenterSummary[];
  noScorePresenters: PresenterSummary[];
  poolShortfalls: string[];
  tieBreaks: TieBreakAudit[];
  prizeCutoffReviews: PrizeCutoffReview[];
  judgeDisagreementReviews: JudgeDisagreementReview[];
  unresolvedTies: string[];
  dataQualityIssues: DataQualityIssue[];
};

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((cell) => cell.trim() !== ""));
}

export function loadRecords(filePath: string): { headers: string[]; records: CsvRecord[] } {
  const csvRows = parseCsv(readFileSync(filePath, "utf8"));
  const [headers, ...rows] = csvRows;

  if (!headers) {
    throw new Error(`No CSV header found in ${filePath}`);
  }

  return {
    headers,
    records: rows.map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
    ),
  };
}

export function scoreValue(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid score value: ${value}`);
  }

  return parsed;
}

export function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function populationStandardDeviation(values: number[], mean: number): number | null {
  if (values.length <= 1) {
    return null;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function formatNumber(value: number | null): string {
  return value === null ? "N/A" : value.toFixed(4);
}

export function groupPresenters(records: CsvRecord[]): PresenterGroup[] {
  const groups = new Map<string, PresenterGroup>();

  for (const row of records) {
    const presenter = row.PRESENTER.trim();
    const title = row.TITLE.trim();
    const key = `${presenter}\u0000${title}`;

    if (!groups.has(key)) {
      groups.set(key, { key, presenter, title, rows: [] });
    }

    groups.get(key)?.rows.push(row);
  }

  return [...groups.values()];
}

export function validateData(
  records: CsvRecord[],
  headers: string[],
  groups: PresenterGroup[],
  judgeColumns: string[],
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  if (headers.slice(0, 5).join("\u0000") !== EXPECTED_FIRST_COLUMNS.join("\u0000")) {
    issues.push({
      kind: "layout",
      message: `Columns A-E should be ${EXPECTED_FIRST_COLUMNS.join(", ")}`,
    });
  }

  if (judgeColumns.length === 0) {
    issues.push({
      kind: "layout",
      message: "No judge score columns found from column F onward",
    });
  }

  const titlesByPresenter = new Map<string, Set<string>>();
  const scoreCountsByJudge = new Map(judgeColumns.map((judge) => [judge, 0]));

  records.forEach((row, index) => {
    const rowNumber = index + 2;
    for (const field of EXPECTED_FIRST_COLUMNS) {
      if ((row[field] ?? "").trim() === "") {
        issues.push({
          kind: "required-field",
          message: `Row ${rowNumber}: missing required ${field}`,
        });
      }
    }

    const presenter = row.PRESENTER.trim();
    const title = row.TITLE.trim();
    if (presenter !== "" && title !== "") {
      const titles = titlesByPresenter.get(presenter) ?? new Set<string>();
      titles.add(title);
      titlesByPresenter.set(presenter, titles);
    }

    const group = row.GROUP.trim();
    if (group !== "" && !VALID_GROUPS.has(group)) {
      issues.push({
        kind: "metadata",
        message: `Row ${rowNumber}: unexpected GROUP "${group}"`,
      });
    }

    const category = row.CATEGORY.trim();
    if (category !== "" && !VALID_CATEGORIES.has(category)) {
      issues.push({
        kind: "metadata",
        message: `Row ${rowNumber}: unexpected CATEGORY "${category}"`,
      });
    }

    const criterion = row.CRITERION.trim();
    if (criterion !== "" && !VALID_CRITERIA.has(criterion)) {
      issues.push({
        kind: "criteria",
        message: `Row ${rowNumber}: unexpected CRITERION "${criterion}"`,
      });
    }

    for (const judge of judgeColumns) {
      const rawScore = (row[judge] ?? "").trim();
      if (rawScore === "") {
        continue;
      }

      const parsed = Number(rawScore);
      if (!Number.isFinite(parsed)) {
        issues.push({
          kind: "score",
          message: `Row ${rowNumber}, ${judge}: non-numeric score "${rawScore}"`,
        });
        continue;
      }

      scoreCountsByJudge.set(judge, (scoreCountsByJudge.get(judge) ?? 0) + 1);
      if (parsed < 1 || parsed > 3) {
        issues.push({
          kind: "score",
          message: `Row ${rowNumber}, ${judge}: score ${rawScore} is outside allowed range 1-3`,
        });
      }
    }
  });

  for (const [presenter, titles] of titlesByPresenter) {
    if (titles.size > 1) {
      issues.push({
        kind: "metadata",
        message: `${presenter}: appears with multiple titles [${[...titles].join(" | ")}]`,
      });
    }
  }

  for (const group of groups) {
    if (group.rows.length !== EXPECTED_CRITERIA.length) {
      issues.push({
        kind: "layout",
        message: `${group.presenter}: expected 4 rows, found ${group.rows.length}`,
      });
    }

    const criteria = group.rows.map((row) => row.CRITERION.trim());
    if (criteria.join("\u0000") !== EXPECTED_CRITERIA.join("\u0000")) {
      const missing = EXPECTED_CRITERIA.filter((criterion) => !criteria.includes(criterion));
      const duplicates = criteria.filter(
        (criterion, index) => criterion !== "" && criteria.indexOf(criterion) !== index,
      );
      issues.push({
        kind: "criteria",
        message:
          `${group.presenter}: criteria rows are not the expected four in order` +
          `; found [${criteria.join(" | ")}]` +
          (missing.length > 0 ? `; missing [${missing.join(" | ")}]` : "") +
          (duplicates.length > 0 ? `; duplicate [${[...new Set(duplicates)].join(" | ")}]` : ""),
      });
    }

    for (const judge of judgeColumns) {
      const scoredCriteria = group.rows.filter((row) => (row[judge] ?? "").trim() !== "");
      if (scoredCriteria.length > 0 && scoredCriteria.length < EXPECTED_CRITERIA.length) {
        issues.push({
          kind: "judge-coverage",
          message: `${group.presenter}, ${judge}: scored ${scoredCriteria.length} of 4 criteria`,
        });
      }
    }
  }

  for (const [judge, scoreCount] of scoreCountsByJudge) {
    if (scoreCount === 0) {
      issues.push({
        kind: "judge-coverage",
        message: `${judge}: no scores found in this sheet`,
      });
    }
  }

  return issues;
}

export function buildSummaries(groups: PresenterGroup[], judgeColumns: string[]): PresenterSummary[] {
  return groups.map((group) => {
    const groupsSeen = [...new Set(group.rows.map((row) => row.GROUP.trim()))];
    const categoriesSeen = [...new Set(group.rows.map((row) => row.CATEGORY.trim()))];
    const judgeRawScores = new Map<string, number>();
    const criterionScores = new Map<string, number[]>();

    for (const criterion of EXPECTED_CRITERIA) {
      criterionScores.set(criterion, []);
    }

    for (const judge of judgeColumns) {
      const judgeScores: number[] = [];

      for (const row of group.rows) {
        const score = scoreValue(row[judge] ?? "");
        if (score === null) {
          continue;
        }

        judgeScores.push(score);
        const criterion = row.CRITERION.trim();
        if (!criterionScores.has(criterion)) {
          criterionScores.set(criterion, []);
        }
        criterionScores.get(criterion)?.push(score);
      }

      const judgeMean = average(judgeScores);
      if (judgeMean !== null) {
        judgeRawScores.set(judge, judgeMean);
      }
    }

    const rawMeans = [...judgeRawScores.values()];

    return {
      key: group.key,
      presenter: group.presenter,
      title: group.title,
      group: groupsSeen[0] ?? "",
      category: categoriesSeen[0] ?? "",
      groupsSeen,
      categoriesSeen,
      criterionScores,
      rawOverallAverage: average(criterionScores.get("Overall Impression") ?? []),
      rawResearchAverage: average(
        criterionScores.get("Research Quality & Significance") ?? [],
      ),
      judgeRawScores,
      adjustedScore: null,
      rawMean: average(rawMeans),
      judgeCount: judgeRawScores.size,
    };
  });
}

export function normalizeScores(
  summaries: PresenterSummary[],
  judgeColumns: string[],
  normalizationMethod: NormalizationMethod,
): JudgeStats[] {
  const adjustedByPresenter = new Map<string, number[]>();
  const judgeStats: JudgeStats[] = [];

  for (const judge of judgeColumns) {
    const scores = summaries
      .map((summary) => summary.judgeRawScores.get(judge))
      .filter((value): value is number => value !== undefined);
    const mean = average(scores);

    if (mean === null) {
      continue;
    }

    const standardDeviation = populationStandardDeviation(scores, mean);
    const canUseZScore =
      normalizationMethod === "Z-SCORE" &&
      standardDeviation !== null &&
      standardDeviation !== 0;
    const usedFallback = normalizationMethod === "Z-SCORE" && !canUseZScore;

    judgeStats.push({
      judge,
      mean,
      standardDeviation,
      scoreCount: scores.length,
      usedFallback,
    });

    for (const summary of summaries) {
      const rawScore = summary.judgeRawScores.get(judge);
      if (rawScore === undefined) {
        continue;
      }

      const adjusted = canUseZScore
        ? (rawScore - mean) / standardDeviation
        : rawScore - mean;
      const current = adjustedByPresenter.get(summary.key) ?? [];
      current.push(adjusted);
      adjustedByPresenter.set(summary.key, current);
    }
  }

  for (const summary of summaries) {
    summary.adjustedScore = average(adjustedByPresenter.get(summary.key) ?? []);
  }

  return judgeStats;
}

export function compareForRank(left: PresenterSummary, right: PresenterSummary): number {
  const leftAdjusted = left.adjustedScore ?? Number.NEGATIVE_INFINITY;
  const rightAdjusted = right.adjustedScore ?? Number.NEGATIVE_INFINITY;
  if (leftAdjusted !== rightAdjusted) {
    return rightAdjusted - leftAdjusted;
  }

  const leftOverall = left.rawOverallAverage ?? Number.NEGATIVE_INFINITY;
  const rightOverall = right.rawOverallAverage ?? Number.NEGATIVE_INFINITY;
  if (leftOverall !== rightOverall) {
    return rightOverall - leftOverall;
  }

  const leftResearch = left.rawResearchAverage ?? Number.NEGATIVE_INFINITY;
  const rightResearch = right.rawResearchAverage ?? Number.NEGATIVE_INFINITY;
  if (leftResearch !== rightResearch) {
    return rightResearch - leftResearch;
  }

  return left.presenter.localeCompare(right.presenter);
}

export function hasUnresolvedTie(left: PresenterSummary, right: PresenterSummary): boolean {
  return (
    left.adjustedScore === right.adjustedScore &&
    left.rawOverallAverage === right.rawOverallAverage &&
    left.rawResearchAverage === right.rawResearchAverage
  );
}

export function tieBreakReason(
  left: PresenterSummary,
  right: PresenterSummary,
): TieBreakReason | null {
  if (left.adjustedScore !== right.adjustedScore) {
    return null;
  }

  if (left.rawOverallAverage !== right.rawOverallAverage) {
    return "Overall Impression";
  }

  if (left.rawResearchAverage !== right.rawResearchAverage) {
    return "Research Quality & Significance";
  }

  return "Unresolved";
}

export function buildRanking(poolPresenters: PresenterSummary[], prizes: string[]): RankingRow[] {
  return poolPresenters
    .filter((presenter) => presenter.adjustedScore !== null)
    .toSorted(compareForRank)
    .map((presenter, index) => ({
      ...presenter,
      rank: index + 1,
      prize: prizes[index] ?? "",
    }));
}

export function buildJudgeDisagreementReviews(
  summaries: PresenterSummary[],
  judgeStats: JudgeStats[],
): JudgeDisagreementReview[] {
  const judgeMeans = new Map(judgeStats.map((judge) => [judge.judge, judge.mean]));

  return summaries
    .map((summary) => {
      const centeredScores = [...summary.judgeRawScores.entries()]
        .map(([judge, rawScore]) => {
          const judgeMean = judgeMeans.get(judge);
          return judgeMean === undefined ? null : rawScore - judgeMean;
        })
        .filter((value): value is number => value !== null);

      if (centeredScores.length < 2) {
        return null;
      }

      const centeredMin = Math.min(...centeredScores);
      const centeredMax = Math.max(...centeredScores);
      const centeredRange = centeredMax - centeredMin;
      const isHighDisagreement = centeredRange >= JUDGE_DISAGREEMENT_THRESHOLD;

      return {
        presenter: summary.presenter,
        centeredMin,
        centeredMax,
        centeredRange,
        judgeCount: centeredScores.length,
        isHighDisagreement,
        recommendation: isHighDisagreement
          ? "Manual review recommended: judge-centered scores vary widely for this presenter; inspect the raw criteria and judge coverage."
          : "No manual disagreement review needed based on the configured threshold.",
      };
    })
    .filter((review): review is JudgeDisagreementReview => review !== null)
    .toSorted((left, right) => right.centeredRange - left.centeredRange);
}

export function buildRankingReviewNotes(
  poolName: string,
  rows: RankingRow[],
  tieBreaks: TieBreakAudit[],
): Map<string, string[]> {
  const notes = new Map<string, string[]>();
  const tieBreaksByPair = new Map(
    tieBreaks.map((tieBreak) => [
      `${tieBreak.poolName}\u0000${tieBreak.presenterA}\u0000${tieBreak.presenterB}`,
      tieBreak,
    ]),
  );

  const addNote = (presenter: string, note: string) => {
    const existing = notes.get(presenter) ?? [];
    existing.push(note);
    notes.set(presenter, existing);
  };

  for (let index = 0; index < rows.length - 1; index += 1) {
    const current = rows[index];
    const next = rows[index + 1];
    if (!current || !next || current.adjustedScore === null || next.adjustedScore === null) {
      continue;
    }

    const tieBreak = tieBreaksByPair.get(`${poolName}\u0000${current.presenter}\u0000${next.presenter}`);
    if (tieBreak) {
      const note =
        tieBreak.reason === "Unresolved"
          ? `exact adjusted tie with ${next.presenter}; unresolved after tie-breakers`
          : `exact adjusted tie with ${next.presenter}; ordered by ${tieBreak.reason}`;
      addNote(current.presenter, `${note}; no statistical separation claimed`);
      addNote(
        next.presenter,
        tieBreak.reason === "Unresolved"
          ? `exact adjusted tie with ${current.presenter}; unresolved after tie-breakers; no statistical separation claimed`
          : `exact adjusted tie with ${current.presenter}; ordered by ${tieBreak.reason}; no statistical separation claimed`,
      );
      continue;
    }

    const margin = current.adjustedScore - next.adjustedScore;
    if (margin <= CLOSE_MARGIN_THRESHOLD) {
      addNote(
        current.presenter,
        `low margin over ${next.presenter} (+${formatNumber(margin)}); no statistical separation claimed`,
      );
      addNote(
        next.presenter,
        `low margin behind ${current.presenter} (-${formatNumber(margin)}); no statistical separation claimed`,
      );
    }
  }

  return notes;
}

export function calculateScores(
  records: CsvRecord[],
  headers: string[],
  normalizationMethod: NormalizationMethod = NORMALIZATION_METHOD,
): ScoreResult {
  const judgeColumns = headers.slice(5);
  const presenterGroups = groupPresenters(records);
  const dataQualityIssues = validateData(records, headers, presenterGroups, judgeColumns);
  const summaries = buildSummaries(presenterGroups, judgeColumns);
  const judgeStats = normalizeScores(summaries, judgeColumns, normalizationMethod);
  const judgeDisagreementReviews = buildJudgeDisagreementReviews(summaries, judgeStats);
  const rankings = new Map<string, RankingRow[]>();
  const poolShortfalls: string[] = [];
  const tieBreaks: TieBreakAudit[] = [];
  const prizeCutoffReviews: PrizeCutoffReview[] = [];
  const unresolvedTies: string[] = [];
  const winners: string[] = [];

  for (const pool of POOLS) {
    const poolPresenters = summaries.filter(pool.includes);
    const ranking = buildRanking(poolPresenters, pool.prizes);
    rankings.set(pool.name, ranking);

    if (ranking.length < pool.prizes.length) {
      poolShortfalls.push(
        `${pool.name}: ${ranking.length} scored presenter(s) for ${pool.prizes.length} prize(s)`,
      );
    }

    for (let index = 0; index < ranking.length - 1; index += 1) {
      const current = ranking[index];
      const next = ranking[index + 1];
      const reason = current && next ? tieBreakReason(current, next) : null;
      if (current && next && reason !== null) {
        tieBreaks.push({
          poolName: pool.name,
          presenterA: current.presenter,
          presenterB: next.presenter,
          reason,
          adjustedScore: current.adjustedScore ?? Number.NaN,
          overallA: current.rawOverallAverage,
          overallB: next.rawOverallAverage,
          researchA: current.rawResearchAverage,
          researchB: next.rawResearchAverage,
        });
      }
      if (current && next && reason === "Unresolved") {
        unresolvedTies.push(`${pool.name}: ${current.presenter} and ${next.presenter}`);
      }
    }

    for (const row of ranking.filter((ranked) => ranked.prize !== "")) {
      winners.push(`${pool.name} ${row.rank}: ${row.presenter} (${row.prize})`);
    }

    const lastPrizeIndex = pool.prizes.length - 1;
    const lastPrizeWinner = ranking[lastPrizeIndex];
    const nextPresenter = ranking[lastPrizeIndex + 1];
    if (lastPrizeWinner && nextPresenter) {
      const margin =
        (lastPrizeWinner.adjustedScore ?? Number.NaN) -
        (nextPresenter.adjustedScore ?? Number.NaN);
      const isClose = Number.isFinite(margin) && margin <= CLOSE_MARGIN_THRESHOLD;
      prizeCutoffReviews.push({
        poolName: pool.name,
        lastPrizeRank: lastPrizeWinner.rank,
        lastPrizePresenter: lastPrizeWinner.presenter,
        nextPresenter: nextPresenter.presenter,
        margin,
        isClose,
        recommendation: isClose
          ? "Manual review recommended before announcing: verify raw rows, judge coverage, and tie-break evidence for both presenters."
          : "No manual prize-cutoff review needed based on the configured close-margin threshold.",
      });
    }
  }

  return {
    normalizationMethod,
    presenterSummaries: summaries,
    rankings,
    winners,
    judgeStats,
    inconsistentPresenters: summaries.filter(
      (summary) => summary.groupsSeen.length > 1 || summary.categoriesSeen.length > 1,
    ),
    noScorePresenters: summaries.filter((summary) => summary.judgeCount === 0),
    poolShortfalls,
    tieBreaks,
    prizeCutoffReviews,
    judgeDisagreementReviews,
    unresolvedTies,
    dataQualityIssues,
  };
}

export function printTable(rows: RankingRow[], reviewNotes = new Map<string, string[]>()): void {
  console.log("rank | presenter | adjusted score | raw mean | judges | prize | review note");
  console.log("--- | --- | ---: | ---: | ---: | --- | ---");

  if (rows.length === 0) {
    console.log("(no scored presenters)");
    return;
  }

  for (const row of rows) {
    console.log(
      [
        row.rank,
        row.presenter,
        formatNumber(row.adjustedScore),
        formatNumber(row.rawMean),
        row.judgeCount,
        row.prize,
        reviewNotes.get(row.presenter)?.join("; ") ?? "",
      ].join(" | "),
    );
  }
}

function formatJudgeScoreList(summary: PresenterSummary): string {
  const scores = [...summary.judgeRawScores.entries()].map(
    ([judge, score]) => `${judge}=${formatNumber(score)}`,
  );

  return scores.length === 0 ? "no judge scores" : scores.join("; ");
}

function compareNullableNumbersDescending(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return right - left;
}

function compareSummariesByRawMean(left: PresenterSummary, right: PresenterSummary): number {
  return (
    compareNullableNumbersDescending(left.rawMean, right.rawMean) ||
    left.presenter.localeCompare(right.presenter)
  );
}

function compareSummariesByAdjustedScore(
  left: PresenterSummary,
  right: PresenterSummary,
): number {
  return (
    compareNullableNumbersDescending(left.adjustedScore, right.adjustedScore) ||
    left.presenter.localeCompare(right.presenter)
  );
}

export function printAuditLog(
  result: ScoreResult,
  headers: string[],
  records: CsvRecord[],
): void {
  const judgeColumns = headers.slice(5);

  console.log("Scoring audit log");
  console.log(`Layout: read ${records.length} scoring row(s).`);
  console.log(`Layout: columns A-E = ${headers.slice(0, 5).join(", ")}.`);
  console.log(`Layout: judge columns F onward = ${judgeColumns.join(", ")}.`);
  console.log(
    `Layout: grouped rows into ${result.presenterSummaries.length} presenter/title block(s), expecting 4 criteria per block.`,
  );

  console.log("\nStep 1 - One number per judge, per presenter");
  console.log(
    "For each presenter and judge, averaged that judge's non-blank criterion scores across the four rows.",
  );
  for (const summary of result.presenterSummaries.toSorted(compareSummariesByRawMean)) {
    console.log(
      `- ${summary.presenter}: raw mean=${formatNumber(summary.rawMean)}; ${formatJudgeScoreList(
        summary,
      )}`,
    );
  }

  console.log("\nStep 2 - Adjust for judge leniency");
  console.log(`Normalization method selected: ${result.normalizationMethod}.`);
  for (const judge of result.judgeStats) {
    const fallbackNote = judge.usedFallback ? " (fell back to mean-centering)" : "";
    console.log(
      `- ${judge.judge}: presenter scores=${judge.scoreCount}, mean=${formatNumber(
        judge.mean,
      )}, stddev=${formatNumber(judge.standardDeviation)}${fallbackNote}`,
    );
  }

  console.log("\nStep 3 - Final score per presenter");
  console.log("Averaged each presenter's adjusted values across judges who scored them.");
  for (const summary of result.presenterSummaries.toSorted(compareSummariesByAdjustedScore)) {
    console.log(
      `- ${summary.presenter}: adjusted=${formatNumber(summary.adjustedScore)}, raw mean=${formatNumber(
        summary.rawMean,
      )}, judges=${summary.judgeCount}`,
    );
  }

  console.log("\nStep 4 - Award pools");
  for (const pool of POOLS) {
    const rows = result.rankings.get(pool.name) ?? [];
    console.log(
      `- ${pool.name}: ${rows.length} scored presenter(s), ${pool.prizes.length} prize(s) configured`,
    );
  }

  console.log("\nStep 5 - Rank within each pool");
  console.log(
    "Sorted by adjusted score descending, then raw Overall Impression, then raw Research Quality & Significance.",
  );
  for (const pool of POOLS) {
    const rows = result.rankings.get(pool.name) ?? [];
    const ranked = rows.map((row) => `${row.rank}. ${row.presenter}`).join("; ");
    console.log(`- ${pool.name}: ${ranked === "" ? "no scored presenters" : ranked}`);
  }
  console.log(`Tie-break comparisons needed: ${result.tieBreaks.length}.`);
  if (result.tieBreaks.length === 0) {
    console.log("- None");
  } else {
    for (const tieBreak of result.tieBreaks) {
      console.log(
        `- ${tieBreak.poolName}: ${tieBreak.presenterA} vs ${tieBreak.presenterB} used ${tieBreak.reason} ` +
          `(adjusted=${formatNumber(tieBreak.adjustedScore)}, overall ${formatNumber(
            tieBreak.overallA,
          )} vs ${formatNumber(tieBreak.overallB)}, research ${formatNumber(
            tieBreak.researchA,
          )} vs ${formatNumber(tieBreak.researchB)})`,
      );
    }
  }
  console.log("\nPrize cutoff margin review");
  if (result.prizeCutoffReviews.length === 0) {
    console.log("- No pools had a scored presenter immediately below the final prize.");
  } else {
    for (const review of result.prizeCutoffReviews) {
      console.log(
        `- ${review.poolName}: rank ${review.lastPrizeRank} ${review.lastPrizePresenter} leads ${review.nextPresenter} by ${formatNumber(
          review.margin,
        )} adjusted points. ${review.recommendation}`,
      );
    }
  }
  console.log("\nJudge disagreement review");
  const highDisagreementReviews = result.judgeDisagreementReviews.filter(
    (review) => review.isHighDisagreement,
  );
  if (highDisagreementReviews.length === 0) {
    console.log("- No presenters exceeded the judge-disagreement threshold.");
  } else {
    for (const review of highDisagreementReviews) {
      console.log(
        `- ${review.presenter}: judge-centered range=${formatNumber(
          review.centeredRange,
        )} across ${review.judgeCount} judges ` +
          `(min=${formatNumber(review.centeredMin)}, max=${formatNumber(
            review.centeredMax,
          )}). ${review.recommendation}`,
      );
    }
  }

  console.log("\nFinal ranked output");
}

export function printWarnings(
  inconsistent: PresenterSummary[],
  noScores: PresenterSummary[],
  judgeStats: JudgeStats[],
  poolShortfalls: string[],
  unresolvedTies: string[],
  dataQualityIssues: DataQualityIssue[],
): void {
  const fallbackJudges = judgeStats.filter((judge) => judge.usedFallback);

  console.log("\nFlags");

  console.log("\nZ-score fallback judges:");
  if (fallbackJudges.length === 0) {
    console.log("- None");
  } else {
    for (const judge of fallbackJudges) {
      console.log(
        `- ${judge.judge}: ${judge.scoreCount} scored presenter(s), standard deviation ${formatNumber(
          judge.standardDeviation,
        )}`,
      );
    }
  }

  console.log("\nInconsistent Category or Group across presenter rows:");
  if (inconsistent.length === 0) {
    console.log("- None");
  } else {
    for (const summary of inconsistent) {
      console.log(
        `- ${summary.presenter}: groups=[${summary.groupsSeen.join(", ")}], categories=[${summary.categoriesSeen.join(", ")}]`,
      );
    }
  }

  console.log("\nPools with fewer scored presenters than prizes:");
  if (poolShortfalls.length === 0) {
    console.log("- None");
  } else {
    for (const warning of poolShortfalls) {
      console.log(`- ${warning}`);
    }
  }

  console.log("\nPresenters with no scores at all:");
  if (noScores.length === 0) {
    console.log("- None");
  } else {
    for (const summary of noScores) {
      console.log(`- ${summary.presenter}`);
    }
  }

  console.log("\nUnresolved ties after all tie-breakers:");
  if (unresolvedTies.length === 0) {
    console.log("- None");
  } else {
    for (const tie of unresolvedTies) {
      console.log(`- ${tie}`);
    }
  }

  console.log("\nOther data quality checks:");
  if (dataQualityIssues.length === 0) {
    console.log("- None");
  } else {
    for (const issue of dataQualityIssues) {
      console.log(`- [${issue.kind}] ${issue.message}`);
    }
  }
}

export function main(): void {
  const { headers, records } = loadRecords(resolve(DATA_FILE));
  const result = calculateScores(records, headers, NORMALIZATION_METHOD);

  printAuditLog(result, headers, records);

  console.log(`Normalization method used: ${result.normalizationMethod}`);

  for (const pool of POOLS) {
    const ranking = result.rankings.get(pool.name) ?? [];
    const reviewNotes = buildRankingReviewNotes(pool.name, ranking, result.tieBreaks);

    console.log(`\n${pool.name}`);
    printTable(ranking, reviewNotes);
  }

  console.log("\nWinners summary");
  if (result.winners.length === 0) {
    console.log("- No winners assigned");
  } else {
    for (const line of result.winners) {
      console.log(`- ${line}`);
    }
  }

  printWarnings(
    result.inconsistentPresenters,
    result.noScorePresenters,
    result.judgeStats,
    result.poolShortfalls,
    result.unresolvedTies,
    result.dataQualityIssues,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
