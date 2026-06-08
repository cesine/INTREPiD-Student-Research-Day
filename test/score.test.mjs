import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  calculateScores,
  groupPresenters,
  loadRecords,
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

    const expectedCriteria = [
      "Organization & Visuals",
      "Communication & Delivery",
      "Research Quality & Significance",
      "Overall Impression",
    ];
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
    const result = calculateScores(records, headers, "MEAN-CENTERING");

    assert.equal(result.normalizationMethod, "MEAN-CENTERING");

    const undergraduateLive = result.rankings.get("Undergraduate Live");
    assert.deepEqual(
      undergraduateLive.map((row) => [row.rank, row.presenter, row.prize]),
      [
        [1, "Yeva Gevorgyan", "$150"],
        [2, "Kateryna Hanhur", "$100"],
        [3, "Samuel Makaron", "$50"],
      ],
    );

    const graduate = result.rankings.get("Graduate");
    assert.deepEqual(
      graduate.map((row) => [row.rank, row.presenter, row.prize]),
      [
        [1, "Malachy Bodak", "$150"],
        [2, "Mariana Vasilita", ""],
      ],
    );

    const prerecorded = result.rankings.get("Pre-recorded");
    assert.deepEqual(
      prerecorded.map((row) => [row.rank, row.presenter, row.prize]),
      [
        [1, "Jaren Tasmin", "$100"],
        [2, "Denisse Ramos", "$50"],
        [3, "Maureen Sam-Okomgboeso", ""],
        [4, "Teneesha Young", ""],
      ],
    );

    assert.deepEqual(result.winners, [
      "Undergraduate Live 1: Yeva Gevorgyan ($150)",
      "Undergraduate Live 2: Kateryna Hanhur ($100)",
      "Undergraduate Live 3: Samuel Makaron ($50)",
      "Graduate 1: Malachy Bodak ($150)",
      "Pre-recorded 1: Jaren Tasmin ($100)",
      "Pre-recorded 2: Denisse Ramos ($50)",
    ]);
  });

  it("calculates raw means, adjusted scores, and judge counts from non-blank scores", () => {
    const result = calculateScores(records, headers, "MEAN-CENTERING");
    const undergraduateLive = result.rankings.get("Undergraduate Live");
    const yeva = rowByPresenter(undergraduateLive, "Yeva Gevorgyan");
    const samuel = rowByPresenter(undergraduateLive, "Samuel Makaron");
    const teneesha = rowByPresenter(result.rankings.get("Pre-recorded"), "Teneesha Young");

    closeTo(yeva.adjustedScore, 0.3842592593);
    closeTo(yeva.rawMean, 2.7083333333);
    assert.equal(yeva.judgeCount, 3);

    closeTo(samuel.adjustedScore, -0.5324074074);
    closeTo(samuel.rawMean, 1.7916666667);
    assert.equal(samuel.judgeCount, 3);

    closeTo(teneesha.adjustedScore, -0.4034722222);
    closeTo(teneesha.rawMean, 1.78125);
    assert.equal(teneesha.judgeCount, 4);
  });

  it("flags required data-quality conditions", () => {
    const result = calculateScores(records, headers, "MEAN-CENTERING");

    assert.deepEqual(
      result.inconsistentPresenters.map((presenter) => ({
        presenter: presenter.presenter,
        groupsSeen: presenter.groupsSeen,
        categoriesSeen: presenter.categoriesSeen,
      })),
      [
        {
          presenter: "Malachy Bodak",
          groupsSeen: ["LIVE"],
          categoriesSeen: ["graduate", "undergrad"],
        },
      ],
    );

    assert.deepEqual(
      result.noScorePresenters.map((presenter) => presenter.presenter),
      [
        "Ashley Marte",
        "Richard Martinez Loyola",
        "Ansa Alam",
        "Ava Omidi",
        "Anik Rahman",
        "Gabriela Martinez Loyola",
        "Llewellyn Duncan",
      ],
    );

    assert.deepEqual(result.poolShortfalls, []);
    assert.deepEqual(result.unresolvedTies, []);
  });

  it("falls back from z-score to mean-centering when a judge has no spread", () => {
    const syntheticHeaders = [
      "PRESENTER",
      "TITLE",
      "GROUP",
      "CATEGORY",
      "CRITERION",
      "JUDGE 1 SCORE",
    ];
    const syntheticRecords = [
      ["Presenter A", "A", "LIVE", "undergrad"],
      ["Presenter B", "B", "LIVE", "undergrad"],
    ].flatMap(([presenter, title, group, category]) =>
      [
        "Organization & Visuals",
        "Communication & Delivery",
        "Research Quality & Significance",
        "Overall Impression",
      ].map((criterion) => ({
        PRESENTER: presenter,
        TITLE: title,
        GROUP: group,
        CATEGORY: category,
        CRITERION: criterion,
        "JUDGE 1 SCORE": "2",
      })),
    );

    const result = calculateScores(syntheticRecords, syntheticHeaders, "Z-SCORE");
    assert.deepEqual(result.judgeStats, [
      {
        judge: "JUDGE 1 SCORE",
        mean: 2,
        standardDeviation: 0,
        scoreCount: 2,
        usedFallback: true,
      },
    ]);

    for (const row of result.rankings.get("Undergraduate Live")) {
      assert.equal(row.adjustedScore, 0);
      assert.equal(row.rawMean, 2);
    }
  });
});
