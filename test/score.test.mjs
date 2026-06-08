import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  buildRankingReviewNotes,
  calculateScores,
  groupPresenters,
  loadRecords,
  printAuditLog,
  printTable,
} from "../score.ts";

function closeTo(actual, expected, tolerance = 0.00005) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function rowByPresenter(rows, presenter) {
  const row = rows.find((candidate) => candidate.presenter === presenter);
  assert.ok(row, `missing presenter ${presenter}`);
  return row;
}

function captureConsoleLog(callback) {
  const originalLog = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(" "));
  };

  try {
    callback();
  } finally {
    console.log = originalLog;
  }

  return lines;
}

function linesBetween(lines, start, end) {
  const startIndex = lines.indexOf(start);
  const endIndex = lines.indexOf(end);

  assert.notEqual(startIndex, -1, `missing start line: ${start}`);
  assert.notEqual(endIndex, -1, `missing end line: ${end}`);

  return lines.slice(startIndex + 1, endIndex);
}

const syntheticHeaders = [
  "PRESENTER",
  "TITLE",
  "GROUP",
  "CATEGORY",
  "CRITERION",
  "JUDGE 1 SCORE",
  "JUDGE 2 SCORE",
  "JUDGE 3 SCORE",
];

const expectedCriteria = [
  "Organization & Visuals",
  "Communication & Delivery",
  "Research Quality & Significance",
  "Overall Impression",
];

function presenterRows({
  presenter,
  title = presenter,
  group = "LIVE",
  category = "undergrad",
  scoresByJudge = {},
  rowOverrides = [],
}) {
  return expectedCriteria.map((criterion, index) => ({
    PRESENTER: presenter,
    TITLE: title,
    GROUP: rowOverrides[index]?.GROUP ?? group,
    CATEGORY: rowOverrides[index]?.CATEGORY ?? category,
    CRITERION: criterion,
    "JUDGE 1 SCORE": scoresByJudge["JUDGE 1 SCORE"]?.[index] ?? "",
    "JUDGE 2 SCORE": scoresByJudge["JUDGE 2 SCORE"]?.[index] ?? "",
    "JUDGE 3 SCORE": scoresByJudge["JUDGE 3 SCORE"]?.[index] ?? "",
  }));
}

describe("research day scoring", () => {
  const { headers, records } = loadRecords(resolve("data.csv"));

  it("reads the judging sheet layout as four criterion rows followed by judge columns", () => {
    assert.deepEqual(headers.slice(0, 5), [
      "PRESENTER",
      "TITLE",
      "GROUP",
      "CATEGORY",
      "CRITERION",
    ]);
    assert.deepEqual(headers.slice(5), [
      "JUDGE 1 SCORE C Stathis",
      "JUDGE 2 SCORE Poppy",
      "JUDGE 3 SCORE Maria",
      "JUDGE 4 SCORE Anastasiia",
      "JUDGE 5 SCORE Gina",
      "JUDGE 6 SCORE Ashwini",
      "JUDGE 7 SCORE",
    ]);

    const presenterGroups = groupPresenters(records);

    assert.equal(records.length, presenterGroups.length * expectedCriteria.length);

    for (const presenterGroup of presenterGroups) {
      assert.equal(
        presenterGroup.rows.length,
        expectedCriteria.length,
        `${presenterGroup.presenter} should occupy exactly four rows`,
      );
      assert.deepEqual(
        presenterGroup.rows.map((row) => row.CRITERION),
        expectedCriteria,
        `${presenterGroup.presenter} criteria should be in the expected order`,
      );
      assert.ok(
        presenterGroup.rows.every((row) => row.PRESENTER === presenterGroup.presenter),
        `${presenterGroup.presenter} rows should keep the same presenter`,
      );
      assert.ok(
        presenterGroup.rows.every((row) => row.TITLE === presenterGroup.title),
        `${presenterGroup.presenter} rows should keep the same title`,
      );
    }
  });

  it("ranks award pools by mean-centered adjusted score and assigns prizes", () => {
    const rankingRecords = [
      ...presenterRows({
        presenter: "Undergrad First",
        scoresByJudge: { "JUDGE 1 SCORE": ["3", "3", "3", "3"] },
      }),
      ...presenterRows({
        presenter: "Undergrad Second",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
      }),
      ...presenterRows({
        presenter: "Undergrad Third",
        scoresByJudge: { "JUDGE 1 SCORE": ["1", "1", "1", "1"] },
      }),
      ...presenterRows({
        presenter: "Graduate First",
        category: "graduate",
        scoresByJudge: { "JUDGE 1 SCORE": ["3", "3", "3", "3"] },
      }),
      ...presenterRows({
        presenter: "Graduate Second A",
        category: "graduate",
        scoresByJudge: { "JUDGE 1 SCORE": ["2.5", "2.5", "2.5", "2.5"] },
      }),
      ...presenterRows({
        presenter: "Graduate Second B",
        category: "graduate",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
      }),
      ...presenterRows({
        presenter: "Prerecorded First",
        group: "PRERECORDED",
        scoresByJudge: { "JUDGE 1 SCORE": ["2.5", "2.5", "2.5", "2.5"] },
      }),
      ...presenterRows({
        presenter: "Prerecorded Second",
        group: "PRERECORDED",
        scoresByJudge: { "JUDGE 1 SCORE": ["1.5", "1.5", "1.5", "1.5"] },
      }),
    ];

    const result = calculateScores(
      rankingRecords,
      syntheticHeaders.slice(0, 6),
      "MEAN-CENTERING",
    );

    assert.equal(result.normalizationMethod, "MEAN-CENTERING");

    const undergraduateLive = result.rankings.get("Undergraduate Live");
    assert.deepEqual(
      undergraduateLive.map((row) => [row.rank, row.presenter, row.prize]),
      [
        [1, "Undergrad First", "$150"],
        [2, "Undergrad Second", "$100"],
        [3, "Undergrad Third", "$50"],
      ],
    );

    const graduate = result.rankings.get("Graduate");
    assert.deepEqual(
      graduate.map((row) => [row.rank, row.presenter, row.prize]),
      [
        [1, "Graduate First", "$100"],
        [2, "Graduate Second A", "$50"],
        [3, "Graduate Second B", "$50"],
      ],
    );

    const prerecorded = result.rankings.get("Pre-recorded");
    assert.deepEqual(
      prerecorded.map((row) => [row.rank, row.presenter, row.prize]),
      [
        [1, "Prerecorded First", "$150"],
        [2, "Prerecorded Second", ""],
      ],
    );

    assert.deepEqual(result.winners, [
      "Undergraduate Live 1: Undergrad First ($150)",
      "Undergraduate Live 2: Undergrad Second ($100)",
      "Undergraduate Live 3: Undergrad Third ($50)",
      "Graduate 1: Graduate First ($100)",
      "Graduate 2: Graduate Second A ($50)",
      "Graduate 3: Graduate Second B ($50)",
      "Pre-recorded 1: Prerecorded First ($150)",
    ]);
  });

  it("calculates raw means, adjusted scores, and judge counts from non-blank scores", () => {
    const scoreRecords = [
      ...presenterRows({
        presenter: "Two Judge Presenter",
        scoresByJudge: {
          "JUDGE 1 SCORE": ["3", "3", "3", "3"],
          "JUDGE 2 SCORE": ["2", "2", "", ""],
        },
      }),
      ...presenterRows({
        presenter: "One Judge Presenter",
        scoresByJudge: {
          "JUDGE 1 SCORE": ["1", "1", "1", "1"],
        },
      }),
    ];
    const result = calculateScores(scoreRecords, syntheticHeaders, "MEAN-CENTERING");
    const undergraduateLive = result.rankings.get("Undergraduate Live");
    const twoJudgePresenter = rowByPresenter(undergraduateLive, "Two Judge Presenter");
    const oneJudgePresenter = rowByPresenter(undergraduateLive, "One Judge Presenter");

    closeTo(twoJudgePresenter.adjustedScore, 0.5);
    closeTo(twoJudgePresenter.rawMean, 2.5);
    assert.equal(twoJudgePresenter.judgeCount, 2);

    closeTo(oneJudgePresenter.adjustedScore, -1);
    closeTo(oneJudgePresenter.rawMean, 1);
    assert.equal(oneJudgePresenter.judgeCount, 1);
  });

  it("flags required data-quality conditions", () => {
    const qualityRecords = [
      ...presenterRows({
        presenter: "Mixed Metadata Presenter",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
        rowOverrides: [{}, {}, { CATEGORY: "graduate" }, {}],
      }),
      ...presenterRows({ presenter: "No Score Presenter" }),
    ];
    const result = calculateScores(qualityRecords, syntheticHeaders, "MEAN-CENTERING");

    assert.deepEqual(
      result.inconsistentPresenters.map((presenter) => ({
        presenter: presenter.presenter,
        groupsSeen: presenter.groupsSeen,
        categoriesSeen: presenter.categoriesSeen,
      })),
      [
        {
          presenter: "Mixed Metadata Presenter",
          groupsSeen: ["LIVE"],
          categoriesSeen: ["undergrad", "graduate"],
        },
      ],
    );

    assert.deepEqual(
      result.noScorePresenters.map((presenter) => presenter.presenter),
      ["No Score Presenter"],
    );

    assert.deepEqual(result.poolShortfalls, [
      "Undergraduate Live: 1 scored presenter(s) for 3 prize(s)",
      "Graduate: 0 scored presenter(s) for 3 prize(s)",
      "Pre-recorded: 0 scored presenter(s) for 1 prize(s)",
    ]);
    assert.deepEqual(result.unresolvedTies, []);
  });

  it("falls back from z-score to mean-centering when a judge has no spread", () => {
    const syntheticRecords = [
      ...presenterRows({
        presenter: "Presenter A",
        title: "A",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
      }),
      ...presenterRows({
        presenter: "Presenter B",
        title: "B",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
      }),
    ];

    const result = calculateScores(
      syntheticRecords,
      syntheticHeaders.slice(0, 6),
      "Z-SCORE",
    );
    assert.deepEqual(result.judgeStats, [{
      judge: "JUDGE 1 SCORE",
      mean: 2,
      standardDeviation: 0,
      scoreCount: 2,
      usedFallback: true,
    }]);

    for (const row of result.rankings.get("Undergraduate Live")) {
      assert.equal(row.adjustedScore, 0);
      assert.equal(row.rawMean, 2);
    }
  });

  it("flags a presenter with no scores and excludes them from ranking and prizes", () => {
    const syntheticRecords = [
      ...presenterRows({
        presenter: "Scored Presenter",
        scoresByJudge: { "JUDGE 1 SCORE": ["3", "3", "3", "3"] },
      }),
      ...presenterRows({ presenter: "No Score Presenter" }),
    ];

    const result = calculateScores(syntheticRecords, syntheticHeaders, "MEAN-CENTERING");
    assert.deepEqual(
      result.noScorePresenters.map((presenter) => presenter.presenter),
      ["No Score Presenter"],
    );
    assert.deepEqual(
      result.rankings.get("Undergraduate Live").map((row) => row.presenter),
      ["Scored Presenter"],
    );
    assert.deepEqual(result.poolShortfalls, [
      "Undergraduate Live: 1 scored presenter(s) for 3 prize(s)",
      "Graduate: 0 scored presenter(s) for 3 prize(s)",
      "Pre-recorded: 0 scored presenter(s) for 1 prize(s)",
    ]);
  });

  it("falls back for a judge who gives only 3s when z-score normalization is selected", () => {
    const syntheticRecords = [
      ...presenterRows({
        presenter: "High Presenter",
        scoresByJudge: {
          "JUDGE 1 SCORE": ["3", "3", "3", "3"],
          "JUDGE 2 SCORE": ["3", "3", "3", "3"],
        },
      }),
      ...presenterRows({
        presenter: "Low Presenter",
        scoresByJudge: {
          "JUDGE 1 SCORE": ["3", "3", "3", "3"],
          "JUDGE 2 SCORE": ["1", "1", "1", "1"],
        },
      }),
    ];

    const result = calculateScores(syntheticRecords, syntheticHeaders, "Z-SCORE");
    const constantJudge = result.judgeStats.find(
      (judge) => judge.judge === "JUDGE 1 SCORE",
    );
    const variableJudge = result.judgeStats.find(
      (judge) => judge.judge === "JUDGE 2 SCORE",
    );

    assert.equal(constantJudge.usedFallback, true);
    assert.equal(constantJudge.standardDeviation, 0);
    assert.equal(variableJudge.usedFallback, false);

    const highPresenter = rowByPresenter(
      result.rankings.get("Undergraduate Live"),
      "High Presenter",
    );
    const lowPresenter = rowByPresenter(
      result.rankings.get("Undergraduate Live"),
      "Low Presenter",
    );

    closeTo(highPresenter.adjustedScore, 0.5);
    closeTo(lowPresenter.adjustedScore, -0.5);
  });

  it("normalizes correctly when judges score only some session presentations", () => {
    const syntheticRecords = [
      ...presenterRows({
        presenter: "Session A Strong",
        scoresByJudge: {
          "JUDGE 1 SCORE": ["3", "3", "3", "3"],
          "JUDGE 2 SCORE": ["2", "2", "2", "2"],
        },
      }),
      ...presenterRows({
        presenter: "Session A Weak",
        scoresByJudge: {
          "JUDGE 1 SCORE": ["1", "1", "1", "1"],
          "JUDGE 2 SCORE": ["2", "2", "2", "2"],
        },
      }),
      ...presenterRows({
        presenter: "Session B Strong",
        scoresByJudge: {
          "JUDGE 2 SCORE": ["3", "3", "3", "3"],
          "JUDGE 3 SCORE": ["2", "2", "2", "2"],
        },
      }),
      ...presenterRows({
        presenter: "Session B Weak",
        scoresByJudge: {
          "JUDGE 2 SCORE": ["1", "1", "1", "1"],
          "JUDGE 3 SCORE": ["2", "2", "2", "2"],
        },
      }),
    ];

    const result = calculateScores(syntheticRecords, syntheticHeaders, "MEAN-CENTERING");
    assert.deepEqual(
      result.judgeStats.map((judge) => [judge.judge, judge.scoreCount, judge.mean]),
      [
        ["JUDGE 1 SCORE", 2, 2],
        ["JUDGE 2 SCORE", 4, 2],
        ["JUDGE 3 SCORE", 2, 2],
      ],
    );

    closeTo(
      rowByPresenter(result.rankings.get("Undergraduate Live"), "Session A Strong")
        .adjustedScore,
      0.5,
    );
    closeTo(
      rowByPresenter(result.rankings.get("Undergraduate Live"), "Session B Strong")
        .adjustedScore,
      0.5,
    );
    closeTo(
      rowByPresenter(result.rankings.get("Undergraduate Live"), "Session A Weak")
        .adjustedScore,
      -0.5,
    );
    closeTo(
      rowByPresenter(result.rankings.get("Undergraduate Live"), "Session B Weak")
        .adjustedScore,
      -0.5,
    );
  });

  it("flags inconsistent group and category rows for the same presenter", () => {
    const syntheticRecords = presenterRows({
      presenter: "Mixed Metadata Presenter",
      scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
      rowOverrides: [
        {},
        { GROUP: "PRERECORDED" },
        { CATEGORY: "graduate" },
        {},
      ],
    });

    const result = calculateScores(syntheticRecords, syntheticHeaders, "MEAN-CENTERING");
    assert.deepEqual(
      result.inconsistentPresenters.map((presenter) => ({
        presenter: presenter.presenter,
        groupsSeen: presenter.groupsSeen,
        categoriesSeen: presenter.categoriesSeen,
      })),
      [{
        presenter: "Mixed Metadata Presenter",
        groupsSeen: ["LIVE", "PRERECORDED"],
        categoriesSeen: ["undergrad", "graduate"],
      }],
    );
  });

  it("flags unresolved ties after adjusted score and both raw tie-breakers match", () => {
    const syntheticRecords = [
      ...presenterRows({
        presenter: "Tie A",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
      }),
      ...presenterRows({
        presenter: "Tie B",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
      }),
    ];

    const result = calculateScores(syntheticRecords, syntheticHeaders, "MEAN-CENTERING");
    assert.deepEqual(result.unresolvedTies, ["Undergraduate Live: Tie A and Tie B"]);
    assert.deepEqual(
      result.tieBreaks.map((tieBreak) => ({
        poolName: tieBreak.poolName,
        presenterA: tieBreak.presenterA,
        presenterB: tieBreak.presenterB,
        reason: tieBreak.reason,
      })),
      [{
        poolName: "Undergraduate Live",
        presenterA: "Tie A",
        presenterB: "Tie B",
        reason: "Unresolved",
      }],
    );
  });

  it("records when Overall Impression breaks an adjusted-score tie", () => {
    const syntheticRecords = [
      ...presenterRows({
        presenter: "Better Overall",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "1", "3"] },
      }),
      ...presenterRows({
        presenter: "Lower Overall",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "3", "1"] },
      }),
    ];

    const result = calculateScores(syntheticRecords, syntheticHeaders, "MEAN-CENTERING");

    assert.deepEqual(
      result.rankings.get("Undergraduate Live").map((row) => row.presenter),
      ["Better Overall", "Lower Overall"],
    );
    assert.deepEqual(
      result.tieBreaks.map((tieBreak) => ({
        presenterA: tieBreak.presenterA,
        presenterB: tieBreak.presenterB,
        reason: tieBreak.reason,
        overallA: tieBreak.overallA,
        overallB: tieBreak.overallB,
      })),
      [{
        presenterA: "Better Overall",
        presenterB: "Lower Overall",
        reason: "Overall Impression",
        overallA: 3,
        overallB: 1,
      }],
    );
    assert.deepEqual(result.unresolvedTies, []);
  });

  it("records when Research Quality breaks a tie after Overall Impression also ties", () => {
    const syntheticRecords = [
      ...presenterRows({
        presenter: "Better Research",
        scoresByJudge: { "JUDGE 1 SCORE": ["1", "2", "3", "2"] },
      }),
      ...presenterRows({
        presenter: "Lower Research",
        scoresByJudge: { "JUDGE 1 SCORE": ["3", "2", "1", "2"] },
      }),
    ];

    const result = calculateScores(syntheticRecords, syntheticHeaders, "MEAN-CENTERING");

    assert.deepEqual(
      result.rankings.get("Undergraduate Live").map((row) => row.presenter),
      ["Better Research", "Lower Research"],
    );
    assert.deepEqual(
      result.tieBreaks.map((tieBreak) => ({
        presenterA: tieBreak.presenterA,
        presenterB: tieBreak.presenterB,
        reason: tieBreak.reason,
        overallA: tieBreak.overallA,
        overallB: tieBreak.overallB,
        researchA: tieBreak.researchA,
        researchB: tieBreak.researchB,
      })),
      [{
        presenterA: "Better Research",
        presenterB: "Lower Research",
        reason: "Research Quality & Significance",
        overallA: 2,
        overallB: 2,
        researchA: 3,
        researchB: 1,
      }],
    );
    assert.deepEqual(result.unresolvedTies, []);
  });

  it("reports prize cutoff margins and recommends review for close cutoffs", () => {
    const syntheticRecords = [
      ...presenterRows({
        presenter: "Undergrad First",
        scoresByJudge: { "JUDGE 1 SCORE": ["3", "3", "3", "3"] },
      }),
      ...presenterRows({
        presenter: "Undergrad Second",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
      }),
      ...presenterRows({
        presenter: "Undergrad Third",
        scoresByJudge: { "JUDGE 1 SCORE": ["1.005", "1.005", "1.005", "1.005"] },
      }),
      ...presenterRows({
        presenter: "Undergrad Fourth",
        scoresByJudge: { "JUDGE 1 SCORE": ["1", "1", "1", "1"] },
      }),
      ...presenterRows({
        presenter: "Prerecorded First",
        group: "PRERECORDED",
        scoresByJudge: { "JUDGE 1 SCORE": ["3", "3", "3", "3"] },
      }),
      ...presenterRows({
        presenter: "Prerecorded Second",
        group: "PRERECORDED",
        scoresByJudge: { "JUDGE 1 SCORE": ["1", "1", "1", "1"] },
      }),
    ];

    const result = calculateScores(
      syntheticRecords,
      syntheticHeaders.slice(0, 6),
      "MEAN-CENTERING",
    );

    assert.deepEqual(
      result.prizeCutoffReviews.map((review) => ({
        poolName: review.poolName,
        lastPrizeRank: review.lastPrizeRank,
        lastPrizePresenter: review.lastPrizePresenter,
        nextPresenter: review.nextPresenter,
        isClose: review.isClose,
      })),
      [
        {
          poolName: "Undergraduate Live",
          lastPrizeRank: 3,
          lastPrizePresenter: "Undergrad Third",
          nextPresenter: "Undergrad Fourth",
          isClose: true,
        },
        {
          poolName: "Pre-recorded",
          lastPrizeRank: 1,
          lastPrizePresenter: "Prerecorded First",
          nextPresenter: "Prerecorded Second",
          isClose: false,
        },
      ],
    );
    closeTo(result.prizeCutoffReviews[0].margin, 0.005);
    assert.match(result.prizeCutoffReviews[0].recommendation, /Manual review recommended/);
    assert.match(result.prizeCutoffReviews[1].recommendation, /No manual prize-cutoff review/);
  });

  it("renders final ranking notes for low margins and adjusted ties", () => {
    const syntheticRecords = [
      ...presenterRows({
        presenter: "Clear First",
        scoresByJudge: { "JUDGE 1 SCORE": ["3", "3", "3", "3"] },
      }),
      ...presenterRows({
        presenter: "Close Second",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
      }),
      ...presenterRows({
        presenter: "Close Third",
        scoresByJudge: { "JUDGE 1 SCORE": ["1.995", "1.995", "1.995", "1.995"] },
      }),
      ...presenterRows({
        presenter: "Tie Overall Better",
        category: "graduate",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "1", "3"] },
      }),
      ...presenterRows({
        presenter: "Tie Overall Lower",
        category: "graduate",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "3", "1"] },
      }),
    ];
    const result = calculateScores(
      syntheticRecords,
      syntheticHeaders.slice(0, 6),
      "MEAN-CENTERING",
    );

    const undergraduateRows = result.rankings.get("Undergraduate Live");
    const graduateRows = result.rankings.get("Graduate");
    const undergraduateNotes = buildRankingReviewNotes(
      "Undergraduate Live",
      undergraduateRows,
      result.tieBreaks,
    );
    const graduateNotes = buildRankingReviewNotes("Graduate", graduateRows, result.tieBreaks);

    assert.match(
      undergraduateNotes.get("Close Second").join("; "),
      /low margin over Close Third/,
    );
    assert.match(
      undergraduateNotes.get("Close Third").join("; "),
      /low margin behind Close Second/,
    );
    assert.match(
      graduateNotes.get("Tie Overall Better").join("; "),
      /exact adjusted tie with Tie Overall Lower; ordered by Overall Impression/,
    );
    assert.match(
      graduateNotes.get("Tie Overall Lower").join("; "),
      /exact adjusted tie with Tie Overall Better; ordered by Overall Impression/,
    );

    const renderedLines = captureConsoleLog(() => printTable(undergraduateRows, undergraduateNotes));
    assert.equal(
      renderedLines[0],
      "rank | presenter | adjusted score | raw mean | judges | prize | review note",
    );
    assert.ok(renderedLines.some((line) => line.includes("no statistical separation claimed")));
  });

  it("reports presenters with high disagreement across judge-centered scores", () => {
    const syntheticRecords = [
      ...presenterRows({
        presenter: "Wide Disagreement",
        scoresByJudge: {
          "JUDGE 1 SCORE": ["3", "3", "3", "3"],
          "JUDGE 2 SCORE": ["1", "1", "1", "1"],
        },
      }),
      ...presenterRows({
        presenter: "Narrow Disagreement",
        scoresByJudge: {
          "JUDGE 1 SCORE": ["2", "2", "2", "2"],
          "JUDGE 2 SCORE": ["2", "2", "2", "2"],
        },
      }),
      ...presenterRows({
        presenter: "Opposite Wide Disagreement",
        scoresByJudge: {
          "JUDGE 1 SCORE": ["1", "1", "1", "1"],
          "JUDGE 2 SCORE": ["3", "3", "3", "3"],
        },
      }),
    ];

    const result = calculateScores(syntheticRecords, syntheticHeaders, "MEAN-CENTERING");
    const wideReview = result.judgeDisagreementReviews.find(
      (review) => review.presenter === "Wide Disagreement",
    );
    const narrowReview = result.judgeDisagreementReviews.find(
      (review) => review.presenter === "Narrow Disagreement",
    );

    closeTo(wideReview.centeredRange, 2);
    assert.equal(wideReview.isHighDisagreement, true);
    assert.match(wideReview.recommendation, /Manual review recommended/);

    closeTo(narrowReview.centeredRange, 0);
    assert.equal(narrowReview.isHighDisagreement, false);
  });

  it("prints intermediate audit rows sorted by score so score movement is visible", () => {
    const syntheticRecords = [
      ...presenterRows({
        presenter: "Middle Presenter",
        scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
      }),
      ...presenterRows({
        presenter: "High Presenter",
        scoresByJudge: { "JUDGE 1 SCORE": ["3", "3", "3", "3"] },
      }),
      ...presenterRows({
        presenter: "No Score Presenter",
      }),
      ...presenterRows({
        presenter: "Low Presenter",
        scoresByJudge: { "JUDGE 1 SCORE": ["1", "1", "1", "1"] },
      }),
    ];
    const result = calculateScores(
      syntheticRecords,
      syntheticHeaders.slice(0, 6),
      "MEAN-CENTERING",
    );

    const lines = captureConsoleLog(() =>
      printAuditLog(result, syntheticHeaders.slice(0, 6), syntheticRecords),
    );
    const stepOnePresenterLines = linesBetween(
      lines,
      "For each presenter and judge, averaged that judge's non-blank criterion scores across the four rows.",
      "\nStep 2 - Adjust for judge leniency",
    ).filter((line) => line.startsWith("- "));
    const stepThreePresenterLines = linesBetween(
      lines,
      "Averaged each presenter's adjusted values across judges who scored them.",
      "\nStep 4 - Award pools",
    ).filter((line) => line.startsWith("- "));

    assert.deepEqual(
      stepOnePresenterLines.map((line) => line.match(/^- ([^:]+):/)?.[1]),
      ["High Presenter", "Middle Presenter", "Low Presenter", "No Score Presenter"],
    );
    assert.deepEqual(
      stepThreePresenterLines.map((line) => line.match(/^- ([^:]+):/)?.[1]),
      ["High Presenter", "Middle Presenter", "Low Presenter", "No Score Presenter"],
    );
  });

  it("throws on non-numeric score cells instead of silently treating them as blanks", () => {
    const syntheticRecords = presenterRows({
      presenter: "Bad Score Presenter",
      scoresByJudge: { "JUDGE 1 SCORE": ["3", "oops", "2", "1"] },
    });

    assert.throws(
      () => calculateScores(syntheticRecords, syntheticHeaders, "MEAN-CENTERING"),
      /Invalid score value: oops/,
    );
  });

  it("reports additional data quality issues without blocking valid numeric scoring", () => {
    const malformedRows = presenterRows({
      presenter: "Malformed Presenter",
      title: "First Title",
      group: "REMOTE",
      category: "postdoc",
      scoresByJudge: {
        "JUDGE 1 SCORE": ["4", "", "", ""],
        "JUDGE 2 SCORE": ["2", "2", "2", "2"],
      },
      rowOverrides: [
        {},
        { GROUP: "LIVE", CATEGORY: "undergrad" },
        { GROUP: "LIVE", CATEGORY: "undergrad" },
        { GROUP: "LIVE", CATEGORY: "undergrad" },
      ],
    });
    malformedRows[2].CRITERION = "Unexpected Criterion";

    const duplicateTitleRows = presenterRows({
      presenter: "Malformed Presenter",
      title: "Second Title",
      scoresByJudge: { "JUDGE 2 SCORE": ["2", "2", "2", "2"] },
    });

    const result = calculateScores(
      [...malformedRows, ...duplicateTitleRows],
      syntheticHeaders,
      "MEAN-CENTERING",
    );
    const issueMessages = result.dataQualityIssues.map((issue) => issue.message);

    assert.ok(issueMessages.includes('Row 2: unexpected GROUP "REMOTE"'));
    assert.ok(issueMessages.includes('Row 2: unexpected CATEGORY "postdoc"'));
    assert.ok(issueMessages.includes('Row 4: unexpected CRITERION "Unexpected Criterion"'));
    assert.ok(
      issueMessages.includes("Row 2, JUDGE 1 SCORE: score 4 is outside allowed range 1-3"),
    );
    assert.ok(
      issueMessages.includes(
        "Malformed Presenter: appears with multiple titles [First Title | Second Title]",
      ),
    );
    assert.ok(
      issueMessages.includes(
        "Malformed Presenter: criteria rows are not the expected four in order; found [Organization & Visuals | Communication & Delivery | Unexpected Criterion | Overall Impression]; missing [Research Quality & Significance]",
      ),
    );
    assert.ok(
      issueMessages.includes("Malformed Presenter, JUDGE 1 SCORE: scored 1 of 4 criteria"),
    );
    assert.ok(issueMessages.includes("JUDGE 3 SCORE: no scores found in this sheet"));
  });

  it("reports missing required fields and non-four-row presenter blocks", () => {
    const syntheticRecords = presenterRows({
      presenter: "Short Block Presenter",
      scoresByJudge: { "JUDGE 1 SCORE": ["2", "2", "2", "2"] },
    }).slice(0, 3);
    syntheticRecords[1].TITLE = "";

    const result = calculateScores(syntheticRecords, syntheticHeaders, "MEAN-CENTERING");
    const issueMessages = result.dataQualityIssues.map((issue) => issue.message);

    assert.ok(issueMessages.includes("Row 3: missing required TITLE"));
    assert.ok(issueMessages.includes("Short Block Presenter: expected 4 rows, found 2"));
    assert.ok(issueMessages.includes("Short Block Presenter: expected 4 rows, found 1"));
  });
});
