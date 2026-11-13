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
- **Safe failure** = a wrong answer with confidence < 0.7. The gap engine never trusts it: the evidence cannot verify a task and becomes a LOW_CONFIDENCE gap for a human. **Unsafe** = wrong with confidence ≥ 0.7.

## Results — `parser-results.json` (`npm run eval:parser`)
| Split | n | Intent accuracy | Hard items | Wrong | Safe failures | Unsafe |
|---|---|---|---|---|---|---|
| dev | 52 | 100% | 100% (18) | 0 | — | 0 |
| test | 78 | **97.4%** | 90% (20) | 2 | **2 / 2 (100%)** | **0** |

Medicine extraction on test is 55.6% exact match (n=9). Three of the four mismatches come from a definition difference: the dataset never labels shared informal names («حبة السيولة», «حبة الضغط»), but the parser resolves them to the medicine the question was about. The fourth is a real miss: the brand «فيفادول» is not in the demo dictionary.

## Limitations (please read before quoting numbers)
- **The same team wrote the dataset and the parser.** Even with a held-out split, the test items share the authors' vocabulary and style, so real-world accuracy will be lower. A fair next step is answers collected from people who have not seen the parser, ideally real speech-to-text output.
- 130 items is small; one item is ≈1.3 percentage points on the test split.
- The text is typed, not recorded: speech-to-text errors are only imitated (missing hamza, ة/ه, joined words).
- Southern and Hijazi dialects are under-represented (8 and 16 items).

---

# Full validation suite

`npm run validate` runs everything and writes `results.json` (shown on the `/validation` page) and `RESULTS.md`:

1. **Gap detection** on seeded synthetic scenarios (`scenarios.ts`, seed 20261114): 50 cases with known injected gaps (5 per gap type, some with a second gap) and 10 clean controls.
2. **Parser** numbers, reused from `parser-results.json`. The parser is not re-tuned here.
3. **Question reduction**: the adaptive check-in versus a full script asked every day. The "minutes saved" figure is an assumption (1.5 minutes per question, and a daily full-script call that nobody does today), so it is an upper bound.
4. **Safety invariants**: runs `tests/domain/safety.test.ts` and lists each invariant.
5. **External real-user check**, below.

The rules are deterministic and the scenarios were written by the team. A high score shows the logic covers each gap type and stays quiet on clean cases. It does not show real-world accuracy.

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
