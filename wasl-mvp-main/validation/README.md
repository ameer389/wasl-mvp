# Validation — Saudi-dialect answer understanding

All data here is **synthetic**. These are simulated results, not clinical validation.

## Dataset — `utterances.json`
- **130** hand-written answers in the style of Saudi patients and family members replying to WASL check-in questions. There are 5 question kinds and 10 intents. Each answer has dialect, speaker and tag labels; 38 items (29%) are tagged `hard`.
- **Split** (fixed before the parser existed, ~40/60 within every question-kind × intent group): 52 dev / 78 test.
- Labelling rules are inside the file (`labellingRules`). Labels describe what the speaker *means*, including things a rule-based parser cannot know (numbers relative to the plan, brands missing from the dictionary).
- The dataset was committed (`Phase 3a`) before any parser code (`Phase 3b`).

## Method
- The parser (`src/domain/arabicParser.ts`) is rule-based: normalization, lexicons, negation that depends on the question kind, and a medicine dictionary lookup. It returns an intent, the medicines it found, a confidence and the cues it used.
- Tuning used **only the dev split** (`npm run eval:parser -- --dev-only`). There were three tuning rounds, and all were general fixes: the «و» of «وقف» was mistaken for "and"; modals between a negator and a verb («ما اقدر اوقفها»); a brand-name prefix bug.
- The test split was evaluated once, after the parser was frozen. No test item was edited or relabelled.
- The benchmark compares intent with frozen labels. Its original metrics call disagreements below 0.7 “safe failures” and those at or above 0.7 “unsafe.” Neither label measures downstream evidence correctness, adherence, or clinical safety.

## Historical results — [parser-results.phase03.json](parser-results.phase03.json)
| Split | n | Intent accuracy | Hard items | Wrong | Safe failures | Unsafe |
|---|---|---|---|---|---|---|
| dev | 52 | 100% | 100% (18) | 0 | — | 0 |
| test | 78 | **97.4%** | 90% (20) | 2 | **2 / 2 (100%)** | **0** |

Medicine extraction on test is 55.6% exact match (n=9). Three of the four mismatches come from a definition difference: the dataset never labels shared informal names («حبة السيولة», «حبة الضغط»), but the parser resolves them to the medicine the question was about. The fourth is a real miss: the brand «فيفادول» is not in the demo dictionary.

## Phase 04 results — [parser-results.json](parser-results.json)

Development used the dev subset and new synthetic cases. The test split was scored once after freezing the Phase 04 parser. The data, labels, split and metric definitions are unchanged.

| Split | n | Intent agreement | Hard items | Disagreements below 0.7 | Disagreements at or above 0.7 |
|---|---|---|---|---|---|
| dev | 52 | 90.4% (47/52) | 83.3% (15/18) | 5 | 0 |
| test | 78 | 82.1% (64/78) | 60% (12/20) | 12 | 2 |

Exact medication-name extraction is unchanged at 55.6% (5/9). This measures name extraction independently of whether a report establishes use.

The two above-threshold disagreements, `u092` and `u094`, expect `OLD_DOSE` for denials that do not specify which dose was used. The parser returns `NO`, which the application records as `NOT_DONE` with the actual dose unspecified. Neither case verifies the task or raises `WRONG_DOSE`. Twelve other disagreements went below the threshold. They include deliberate clarification for bare mentions and uncertain temporal scope, plus remaining misses on contextual start, continuation and dose wording. The held-out results were not used to adjust the parser.

## Phase 04B results

[parser-results.phase04b.json](parser-results.phase04b.json) records one comparative run on the frozen dataset after the implementation and synthetic regression tests were frozen. The two historical reports remain at their original paths. The same team authored the new regression tests. The project has no independent evaluation samples.

| Split | Intent agreement | Hard items | Exact name extraction | Disagreements below 0.7 | Disagreements at or above 0.7 |
|---|---|---|---|---|---|
| dev | 90.4% (47/52) | 83.3% (15/18) | 100% (5/5) | 5 | 0 |
| test | 83.3% (65/78) | 60% (12/20) | 55.6% (5/9) | 11 | 2 |

Both above-threshold disagreements are the same justified dosage denials described in the Phase 04 results. The threshold measures whether an intent disagreement would be trusted as an interpretation. Clinical safety also depends on the evidence claim and downstream handling.

Clause rules recover definite reports alongside separate hypothetical or historical language. Some concise missed-dose variants with an attached pronoun and some ongoing use described with an unanchored duration still go to review. A condition governing the only reported use, a bare medicine mention and unclear references also go to review. The parser has no numeric dose comparison against the plan and uses the existing medicine dictionary. VO-02 remains partial because clear variants of current use and continuation can still be routed to review.

At the Phase 04B checkpoint, the planner could suppress `NOT_DONE` on `MED_DOSE_CHANGE` with an unspecified actual dose, while the gap engine emitted no task review or gap. Phase 05 keeps it eligible for follow-up. Phase 06 owns a review or gap path for this state, distinct from `WRONG_DOSE` for an explicitly old dose and `LOW_CONFIDENCE` for an uncertain report.

## Limitations (please read before quoting numbers)
- **The same team wrote the dataset and the parser.** The test items share the authors' vocabulary and style. Independent interpretation accuracy and live speech recognition remain unmeasured.
- 130 items is small; one item is ≈1.3 percentage points on the test split.
- The text is typed, not recorded: speech-to-text errors are only imitated (missing hamza, ة/ه, joined words).
- Southern and Hijazi dialects are under-represented (8 and 16 items).

---

# Full validation suite

`npm run validate` runs everything and writes `results.json` (shown on the `/validation` page) and `RESULTS.md`:

1. **Gap detection** on seeded synthetic scenarios (`scenarios.ts`, seed 20261114): 50 cases with known injected gaps (5 per gap type, some with a second gap) and 10 clean controls.
2. **Parser** numbers from `parser-results.phase04b.json`, alongside the Phase 03 and Phase 04 results on the same written split.
3. **Question planning** against a hypothetical full daily script. A separate replay assumes one session daily and adds zero answers. Staff time and actual user behavior were unmeasured.
4. **Safety invariants**: runs `tests/domain/safety.test.ts` and lists each invariant.
5. **External real-user check**, below.

The rules are deterministic and the scenarios were written by the team. A high score shows the logic covers each gap type and stays quiet on clean cases. It does not show real-world accuracy.

### Phase 05 question planning

The historical Phase 03–04 plan contained 1,683 questions versus 8,304 in the hypothetical full script over 900 synthetic patient-days, a 79.7% reduction. Phase 05 plans 1,747 versus 8,304 over the same days, a 79.0% reduction. More questions can remain eligible after an unreviewed negative report or insufficient system evidence. These are planned counts.

The separate scheduling replay assumes one session daily, presents every selected question and adds zero answers. It reached 466 of 466 eligible tasks, including 135 of 135 eligible high-risk tasks. It recorded 381 later presentations of previously presented tasks, 900 open questions and zero deferrals by capacity in this dataset. Browser verification and the capacity tests exercise repeated same-day sessions and plans above the five-task limit.

The Validation page displays Phase 04B as a repeated written comparison and lists the Phase 03 and Phase 04 results alongside it.

### Phase 06 gap coverage

The original 50 seeded cases and 10 controls retain their inputs and expectations. The Phase 05 output is archived in [results.phase05.json](results.phase05.json). Phase 06 adds a separate set of seven injected cases and one clean control for explicit non-completion, missing or mismatched attendance records, and the feed confidence boundary.

The latest [validation report](RESULTS.md) lists both results. The [rule coverage matrix](phase06-coverage.md) distinguishes trigger evidence, supporting records and planner behavior. The historical Phase 05 question count remains comparable because the seeded cases are unchanged. The new focused cases are evaluated separately.

### Phase 07 lifecycle verification

The Phase 06 output is preserved in [results.phase06.json](results.phase06.json). The original and focused gap-detection inputs and expectations are unchanged in Phase 07. The lifecycle regression tests exercise administrative disposition independently of verification, same-day and later reopening, evidence-linked intervention and review, archived observations, rewind, persistence and targeted Undo. Administrative disposition counts are workflow records and are not measures of clinical success.

The Phase 07 result is preserved in [results.phase07.json](results.phase07.json). Legacy feed records lack explicit event meaning where only source, task ID and day were stored. Phase 08 verifies the abandoned `OPEN_MEDS` retry and independent same-day check-in contradictions, and summarizes final checks in the [engineering report](../docs/phase08-engineering-handoff.md).

### Phase 03 medication expectations

The Phase 02 baseline was 67/67 gaps, zero unexpected results, and 23/23 high-risk routes. The unchanged reports in `scn-004` and `scn-044` formerly expected `DUPLICATE_THERAPY`. Reports in `scn-003`, `scn-015`, `scn-018`, `scn-023`, `scn-025`, `scn-035` and `scn-045` formerly expected `UNLISTED_MED`. These nine reports have confidence below 0.7. They now expect one `LOW_CONFIDENCE` review per report. The generator retains the same seed, evidence, and controls. Expected counts move from 5 to 3 for `DUPLICATE_THERAPY`, 13 to 6 for `UNLISTED_MED`, and 5 to 14 for `LOW_CONFIDENCE`.

## External real-user check

**Why.** The synthetic answers and the parser were written by the same people. The fairest quick test is answers from people who have never seen either.

**How answers are collected.**
- People outside the team answer 5 standard questions (listed in `external-utterances.json`) on WhatsApp, as if they were the patient or a family member.
- They may type or send a voice note. Voice notes are transcribed word for word by a team member, without fixing spelling or dialect.
- Answers are anonymised: a respondent code (R01, R02, …) only. No names, no phone numbers, no screenshots.
- No health data: respondents are told to invent the answer ("answer as if…"), not to describe their own medicines.
- A team member labels the intended meaning (`expectedIntent`) before the parser is run, and does not relabel afterwards.

**How it is scored.** `npm run eval:external` runs the frozen parser once and writes `external-results.json`. It refuses to overwrite a finished result unless `--force` is passed, which is only for adding new answers. Then run `npm run validate` to include it in `RESULTS.md` and the page.

**Status.** Pending: `external-utterances.json` has no items yet.
