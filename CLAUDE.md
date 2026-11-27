# WASL MVP — project context

## Product
WASL ("وصل") — The Executable Discharge Plan. It turns a hospital discharge plan into an executable "care graph" of tasks (start new meds, stop old meds, dose changes, labs, follow-up booking/attendance, wound checks), each with an owner, deadline and risk level. It verifies what ACTUALLY happens at home (patient/family check-ins in Saudi Arabic dialect by voice or buttons + simulated EHR/lab/appointment feeds), compares EXPECTED vs ACTUAL, and surfaces only the care gaps that need a clinician — ranked by risk, with evidence, reasons and an audit trail. "Ask only what is uncertain." Not another EHR: an execution/verification layer on top of existing records.

## Non-negotiable rules
1. Synthetic data only. No real patient data. Every screen shows a "DEMO · synthetic data" badge.
2. No autonomous clinical decisions: never recommend doses, prescribe or diagnose. The system only surfaces gaps and routes them to a human.
3. Honest metrics: anything computed from simulated data is labelled "simulated". Never claim clinical validation.
4. Explainability: every gap shows why (expected task, evidence, rule fired).
5. Judges will read this repo: clean structure, TypeScript types, pure testable domain logic, passing tests, small focused commits.

## Stack
Vite + React + TypeScript, Tailwind CSS v4 (@tailwindcss/vite), React Router with HashRouter (GitHub Pages), Vitest. WASL state is in memory + localStorage with "Reset demo". Standard voice uses Web Speech API (webkitSpeechRecognition, lang 'ar-SA') with button/text fallback. The local HUMAIN check-in uses a loopback session broker and submits proposals against displayed questions. App-controlled echo confirmation and the existing WASL evidence pipeline determine what is recorded. See `docs/phase09b-hybrid-voice-integration.md`. Deploy: GitHub Pages via GitHub Actions; Vite base comes from one constant ('/wasl-mvp/').

## Languages
Clinician side = English (LTR). Patient side = Arabic Saudi dialect (RTL, elderly-friendly, big touch targets). Fonts: Inter (EN), IBM Plex Sans Arabic (AR).

## Look & feel (match our MEDATHON deck)
Dark navy/teal, calm and clean. bg #06141c, panels #0b2230, borders #12384a, accent teal #22d3ee, success #34d399, medium/amber #fbbf24, high/red #f43f5e, text #e6f1f5, muted #8aa4b0. Rounded cards, subtle borders, generous spacing.

WASL is a product with two apps, not a website. Follow these rules in every phase:

**Tokens** (src/index.css `@theme`, used as Tailwind utilities). Surfaces: `bg` → `surface-1` (#0b2230) → `surface-2` (#0f2a3a) → `surface-3`. Borders: hairline `line`, hover `line-strong`. Text: `ink` → `ink-2` → `muted` → `faint`. Semantic: `accent`, `success`, `medium`, `high`. Fonts: `font-sans` (Inter) and `font-arabic` (IBM Plex Sans Arabic; applied automatically to `[dir=rtl]` / `:lang(ar)`).

**Colour usage.** Teal `accent` only for primary actions, the active nav item and focus rings (about 10% of a screen). Red/amber/green only for risk and status meaning (high / medium / verified), never decoration. Everything else is neutral. The DEMO badge is neutral.

**Shape & type.** Cards `rounded-xl`, controls `rounded-lg`, very subtle shadows (`shadow-card`, `shadow-pop`). At most 3 type sizes per view. `tracking-tight` on headings. `tabular-nums` on every number (counts, days, metrics), applied per element, not globally (it widens Inter's hyphens).

**Interaction states.** Every interactive element has default / hover / focus-visible (2px teal ring) / active (`scale-[0.98]`) / disabled (`opacity-40`) states. Use the shared `interactive` and `focusRing` classes from src/components/ui/styles.ts. Transitions: `duration-150 ease-out`. Respect prefers-reduced-motion (global CSS rule plus `motion-reduce:` variants).

**Primitives** (src/components/ui, import from `components/ui`): Button (`primary|secondary|ghost|danger`, `sm|md|lg`; `buttonClasses()` for links), IconButton (always has `label`), Card, Badge (`high|medium|low|verified|neutral`), StatCard (`simulated` tag for any simulated metric), EmptyState (`size="large"` in the patient app), Toast (`useToast().show({message, action})`, auto-dismiss 4s, optional Undo), Tooltip, Kbd, Tabs. Build new UI from these; don't hand-roll buttons or cards.

**Shell 1 — Care team console** (src/components/console, EN, LTR, desktop). Routes: /clinician, /clinician/patients, /clinician/new, /clinician/patient/:id, /validation, /about. Left sidebar `w-60` that collapses to a `w-16` icon rail (choice remembered in localStorage; forced rail below 1024px). Top bar `h-14` with breadcrumb + page title (from `CONSOLE_PAGES` in src/routes.ts), the simulated Day stepper (`[` and `]` keys) and the "Escalations now" indicator. Content is full width with `p-6`, and pages do not render their own `<h1>` (the top bar owns it). Use real-sounding EmptyStates, never lorem ipsum or "coming soon". There must never be horizontal overflow at 1280px or 1440px.

**Shell 2 — Patient app** (src/components/patient, AR Saudi dialect, RTL, mobile). Routes: /patient/:id (اليوم), /meds, /appointments, /help. Above 640px it renders inside a 390×844 phone frame with a caption; on real phones it is full screen. It has a header (wordmark, greeting, avatar, Arabic demo badge) and a bottom tab bar (≥56px, active tab teal, safe-area padding). Base text 18px, touch targets ≥48px, one main action per screen, and Arabic-Indic digits via `toArabicDigits()`.

**Root "/"** is a compact role launcher (two app cards), not a marketing page. The Expected → Home → Actual explainer lives in /about.

**Visual check.** With `npm run dev` running, `npm run check:views` drives the installed Chrome (playwright-core). It fails on console errors or horizontal overflow and writes screenshots to /screenshots (git-ignored).

## Structure
src/domain (pure logic: types, drugs, careGraph, gapEngine, questionPlanner, arabicParser, audit)
src/data (synthetic sample patients)
src/state (store, persistence, simulated day)
src/pages, src/components
validation/ (synthetic test scenarios, labelled utterances, results)
tests/ (vitest)

## Domain conventions (Phase 2, follow in later phases)
- Pipeline: `buildCareGraph(patient)` → `evaluate(patient, tasks, evidence, resolutions, today)` → `planQuestions(...)`. All three are pure; React only goes through `src/state/store.tsx` (`useDemoStore`, `usePatient`, `useQuestionPlan`, `useSimulatedDay`).
- Task status is derived, never stored. Ids are deterministic: tasks `${patientId}/${type}/${refId}@d${deadline}`, gaps `${patientId}:${type}:${taskId|drugId}`.
- Evidence links to a task via `taskId`. Medication-level reports (`TAKING_UNLISTED`) use `drugId`. Only evidence with `day ≤ today` counts.
- `VERIFY_THRESHOLD = 0.7` is a hard floor: below it nothing verifies, and claim rules (NOT_STARTED / STOPPED_STILL_TAKEN / WRONG_DOSE) don't fire. A LOW_CONFIDENCE gap fires instead and is routed by the task's risk. A human confirmation is recorded as confidence 1.
- Feed-verifiable tasks (LAB_DONE, FOLLOWUP_*) are covered by the feed rules, not by NO_RESPONSE, and the planner asks about them only once the feed is silent past due.
- Gap dispositions bind to the current condition revision and its triggering evidence. Material evidence can reopen a stable gap in a new episode. Every accepted decision writes an audit entry.
- Reason strings are descriptive (expected → evidence → rule fired). Never write increase/decrease/take/give/stop taking/double/reduce; tests enforce this.
- Demo state is persisted under `wasl.demo.v{STATE_VERSION}`. Bump `STATE_VERSION` in src/state/demoState.ts whenever the seed or the state shape changes. The demo opens on `SEED_DAY` (4).

### Phase 02 care graph contract

- Patient IDs and plan row IDs are stable and must be unique in their scope. Medication identity is the dictionary `drugId`. Task IDs keep their patient/type/reference/deadline format, and gap IDs keep their existing task or medication key. Evidence IDs identify individual records. Preserve those IDs and their historical links when resolving conflicts or gaps.
- The plan accepts patient-relative days 0–30. The standard observation window is Day 0–14. The clock extends only as needed to give each discharged patient this window and evaluate the latest task at its first overdue boundary (+1 for feeds, +2 for other current tasks). A Day 14 visit in the seed requires evaluation on Day 15. Tour days and the seed opening day remain unchanged.
- `treatmentEndDay` is an optional, inclusive patient-relative day supplied by the plan author for NEW or CONTINUE. NEW cannot end before the existing Day 1 start check. The field limits continuation checks, leaves existing start deadlines and dose/frequency as written, and never infers a duration or creates a stop action.
- A start-to-continuation link affects question order within a risk tier while the start is eligible to be asked. A booking-to-attendance link is informational. Earlier labs have no implied link to a visit. Task evidence is evaluated independently and a late start retains the original deadline.
- `Evidence.day` and resolution days are patient relative. The audit day is global, and the ISO audit timestamp records the action in the demo. Occurrence day and recording order are distinct. Preserve both when later phases need to compare events within a day. Phase 02 does not change evidence precedence or introduce a shared event sequence.
- Later phases must check source eligibility and what the source actually reports for each task (for example, dispensing and reported use are distinct events). Confidence measures interpretation trust. It does not establish real-world adherence. Preserve original evidence and provenance, represent conflicts explicitly, and keep administrative gap resolution separate from independent task verification. Phase 03 consumes the identity and provenance contract for reconciliation, Phase 04 supplies interpretation evidence, Phase 05 consumes verification and uncertainty, Phase 06 owns claim eligibility, and Phase 07 owns closure and same-day reopening.

## Answer understanding (Phase 3, follow in later phases)
- Flow: question (planner, `kind`) → `parseAnswer(text, { questionKind, drugId, asrConfidence })` → `answerToEvidence(...)` → store `addEvidence`. Never map answers to claims anywhere else.
- Question wording per `QuestionKind` is fixed in questionPlanner.ts and documented on the type. If wording changes, the parser readings must change too.
- Confidence = trust in the interpretation. UNSURE is capped at 0.45 and UNKNOWN is 0.2. Known ASR confidence multiplies into interpretation confidence. Missing ASR confidence is capped below the verification threshold until the patient explicitly confirms an unambiguous echo.
- Shared informal names stay ambiguous unless the question's drug resolves them. In OPEN_MEDS they become UNSURE with candidateDrugIds and no drugId.
- Evaluation discipline: tune with `npm run eval:parser -- --dev-only`. Never edit the parser for a test-split item, and never edit or relabel test items. Report the results and limitations from validation/README.md honestly.

### Phase 03 medication evidence contract

- `reconcileMedications` derives task and open-report assessments. The plan stays authoritative for expected instructions. Select the latest eligible observation at or above `VERIFY_THRESHOLD`, keep weaker later evidence for review, and retain original evidence and prior contradictions. `drugId` identifies a canonical medicine. `reportId` groups one open answer, evidence IDs identify individual unknown reports, and `candidateDrugIds` lists unresolved identities without assigning a drug.
- `day` is the patient-relative occurrence day. `recordedDay` is the patient-relative availability day written at ingestion and defaults to `day` for legacy evidence. Filter on both, then order by occurrence day and append position. A clinician `correctsEvidenceId` correction inherits its target's occurrence position. A current confirmation has its own occurrence day. Audit days remain global.
- A plan or dispensing record does not establish use. Patient and family statements are reported evidence. An EHR use observation requires `eventKind: 'USAGE'`; clinician evidence needs explicit human confirmation. Confidence measures interpretation, and confirming a report does not establish observed adherence. An open report can inform a matching STOP assessment. Task verification still needs task-linked evidence, and starting, continuation and dose change remain distinct events.
- Phase 04 must preserve raw text, source and confidence and separate actual-use claims from mentions. A known medicine uses `drugId`; unresolved names keep candidate IDs and use UNSURE. A confident NONE does not correct previous medication-specific evidence.
- Administrative closure leaves the medication assessment intact. Phase 07 uses the audit sequence for decision associations without changing Phase 03 occurrence order or correction inheritance.

## Care team console (Phase 4, follow in later phases)
- Presentation helpers are pure and tested, in src/domain:
  - `labels.ts`: plain-English gap / route / claim / status labels and short task labels
  - `claimOptions.ts`: what a clinician can confirm per task type; none for feed-verified labs and appointments
  - `queue.ts`: filters, plus grouping NO_RESPONSE per patient
  - `metrics.ts`
  - `graphLayout.ts`: care-graph geometry
  - `planForm.ts`: New discharge validation, `formToPatient`, sample case
  - `auditTrail.ts`: stored audit entries plus derived "Gap detected" rows
- **Per-patient timelines.** `Patient.dischargeDay` is the global simulated day of discharge (demo patients 0, new patients the current day). Each patient's engine day is `patientDay(globalDay, dischargeDay)`. Evidence and resolutions use the patient day; audit entries use the global day. Always go through `store.patientToday(id)`.
- **Clinician actions:**
  - "Log call" records a CALLED resolution and shows "In review".
  - "Confirm what happened" calls `store.confirmTask`, which records clinician evidence with confidence 1 and confirmedByHuman, and the engine re-evaluates.
  - "Mark resolved" records an administrative disposition with a structured reason and a note. Undo reverses that specific resolution. A cleared condition can receive a separate evidence-supported or report-correction resolution.
  - Every one of these writes an audit entry.
- **Deep links:** `/clinician/patient/:id?gap=<gapId>` highlights a gap (`gapLink()` in routes.ts) and `?tab=care-graph|expected|audit` opens a tab.
- **Styling:** cn() does not de-duplicate Tailwind classes. Use `controlClasses` plus your own sizes, or `compactControlClasses`, instead of overriding the sizes inside `inputClasses`.
- **Slide screenshots:** `npm run check:views` (dev server running) writes `screenshots/slide-*.png` at 1440×900, Day 4, and runs the queue, resolve, confirm, new-discharge and care-graph drawer interactions.

## Patient check-in (Phase 5, follow in later phases)
- **Flow:** `/patient/:id/checkin`. The state machine is `checkinReducer` in src/domain/checkin.ts (pure and tested); the page only performs side effects. Questions are snapshotted at the start, so the live plan shrinking doesn't move them.
- **One path to evidence for every answer:** a button (via `quickParse`, confidence 0.95), typed text or voice → `ParseResult` → `evidenceForAnswer` (uses `answerToEvidence` / `toEvidenceClaim`) → `store.recordAnswer`, which writes the evidence and exactly ONE `CHECKIN_ANSWER` audit entry. Source: `patient_voice`, `patient_app`, or `family` in family mode. Day = `patientToday`.
- **Low confidence:** UNSURE, UNKNOWN and anything below 0.7 is still saved as answered, never trusted. The engine raises LOW_CONFIDENCE and the patient sees «بنخلي الممرضة تتأكد منك».
- **Phrasing** lives in src/domain/patientPhrasing.ts:
  - The informal medicine name comes first; the helper line reads «مكتوب على العلبة: {brandAr} ({nameAr})».
  - Forms are gendered by the patient's sex, and family mode uses the third person with the patient's name.
  - No doses, except the DOSE_CHECK helper, which shows the plan's dose exactly as written.
  - The patient is never told to take, stop or change anything.
- **Voice:** `useSpeechRecognition` uses ar-SA with interim results and up to 3 alternatives. `interpretSpeech` prefers the recognizer's score and sends disagreements about a relevant fact to clarification. Missing and numeric zero scores are distinct. Cancellation, final results and errors invalidate the attempt. Text and quick answers remain available.
- **Phase 04 interpretation:** `parseAnswer` scopes evidence to the question and to medication statements within clauses. Name extraction alone does not establish use. Historical reports and unresolved identities stay available for review. Generic new-dose denial uses `NOT_DONE` with an unspecified actual dose, while explicit previous-dose use maps to `OLD_DOSE`. Removing every extracted name saves an answer audit note without generating a medication claim.
- **Voice provenance:** `Evidence.voice` optionally stores recognition confidence, interpretation confidence, patient transcript confirmation and whether alternatives disagreed. Patient echo confirmation does not set `confirmedByHuman`. Phase 05 should distinguish confident negative evidence from missing evidence and consume uncertainty and routing separately from completion status.
- **Settings:** family mode is remembered per patient in browser storage (`wasl.ui.familyMode.<id>`). `Drug.brandAr` is display-only; the parser's name index is unchanged.

### Phase 05 question planning contract

- `evaluate` supplies evidence for follow-up separately from display status and gap routing. The planner uses the effective medication report and the latest relevant uncertainty. For feed tasks it waits through the deadline and then checks the latest eligible system outcome and meaningful newer reports. Patient-reported attendance does not establish system confirmation. Phase 06 owns unification of non-medication eligibility and verification.
- Supported completion ends follow-up. A matching open review for the current report can also pause asking. A generic missing-data gap or an administrative closure does not establish completion or a review of that particular report. Existing explicit clinician confirmations still enter as evidence. Phase 07 owns chronology of review, closure, reopening and re-verification.
- The session keeps its initial list. `CHECKIN_PRESENTED` records only a question reached by the patient. `CHECKIN_ANSWER` remains one atomic audit entry per saved answer with the current evidence-log position. Exclude both future evidence and future presentation history during rewind. Version 7 reads compatible v6, v5 and v4 saves. Reload starts a fresh session using the persisted answers and presentations.
- Retry unresolved tasks the next patient day. A changed eligible observation can reopen a same-day question. Schedule up to five task questions by risk, dependency, urgency, deadline and ID. One routine retry slot can go to an older deferred task while protecting due high-risk first checks and changed observations. `deferredTaskIds` identifies questions still eligible beyond the cap. Continuous urgent demand can consume all five slots.
- `OPEN_MEDS` permits one same-day retry after an unanswered presentation. Any saved outcome ends eligibility that day. Audit outcomes distinguish `NONE`, `REPORTED`, `UNCERTAIN`, `UNKNOWN_MEDICINE` and `DISCARDED` from an unanswered question. The outcome preserves the Phase 03 report and correction history.
- Phase 06 must supply an appropriate review or gap for unreviewed `NOT_DONE` on `MED_CONTINUE`, `WOUND_CHECK` and `MED_DOSE_CHANGE` with an unspecified actual dose. The planner retains follow-up for these reports. A missing attendance feed also needs its own downstream treatment, separate from an explicit missed visit. Phase 08 must update the Validation page's parser presentation to reference the separately qualified Phase 04B result.

### Phase 06 care gap and evidence contract

- `evaluate` exposes per-task `assessments`, planner `followup`, and current rule `conditions` before administrative filtering. All are derived from evidence available by the patient-relative day. Keep the previous effective report and the newer unresolved report separately when they differ. A verified review outcome means evidence sufficient under the demo policy.
- Medication facts still use the Phase 03 assessment. Wound checks accept patient/family reports or explicit clinician confirmation. Lab results, booking and attendance require their matching system outcome. Newly recorded feed events require an event kind: `LAB_RESULT`, `APPOINTMENT_BOOKING` or `APPOINTMENT_ATTENDANCE`. An untyped legacy record uses its canonical feed and task ID. Untyped appointment attendance is eligible from the scheduled day. Patient/family or clinician statements can add context to feed tasks and cannot establish an independent feed event.
- `TASK_NOT_COMPLETED` (severity 6) covers eligible explicit negatives for continuation, wound checks, and use of a new dose with the actual dose unspecified. Continuation and wound checks start at the deadline. Dose reports can open immediately, as with `WRONG_DOSE`. `FOLLOWUP_ATTENDANCE_UNCONFIRMED` (severity 5) covers a missing, weak or ineligible outcome from the day after the visit. `FOLLOWUP_MISSED` requires a reliable appointment-system negative. Keep the existing confidence floor and the two-day `NO_RESPONSE` grace.
- `Gap.triggerEvidenceIds` identifies the records driving the rule. Other `evidenceIds` supply context. `conditions` includes the last available day of triggering evidence even when a gap is administratively closed. Priority retains the same formula, with routing urgency sorted before the numeric score. In-app follow-up is a simulated category backed by planner eligibility.
- State v8 accepts the new event kinds and reads compatible v7–v4 saves. Neither explicit closure nor a call proves task completion. Phase 07 owns same-day event ordering, persistent detection history, evidence-linked review, justification and provenance, re-verification and targeted Undo.

### Phase 07 closed care loop contract

- Phase 06 still determines verification and underlying conditions. The lifecycle uses `Evaluation.conditions`, `assessments` and `Gap.triggerEvidenceIds`. Administrative closure removes a condition from the actionable queue while retaining the condition and unresolved verification in patient and clinician views. Appropriate questions can remain eligible.
- The stable gap ID identifies the rule and entity. The first `GAP_DETECTED` or `GAP_REOPENED` audit ID identifies its episode. A material `GAP_UPDATED` observation identifies a new revision in the same open episode. Review, intervention and disposition link to the current episode, revision and trigger evidence. The evidence ingestion sequence and decision sequence are audit positions. Wall-clock timestamps are display metadata.
- Trigger fingerprints use claim, occurrence day, identity, eligible provenance and confidence band. Duplicate restatements and supporting-only updates leave the revision unchanged. A credible triggering record from an independent submitted check-in after a decision can renew review even when its fingerprint matches. A material change to an administratively closed condition or a recurrence after clearance opens a new episode. Review is specific to an episode and revision. Weak contradictory evidence can open a separate uncertainty condition.
- The reducer records observed transitions on incoming evidence and forward visits to simulated days. Rewind hides later records. An action entered after rewind takes effect on the selected patient day and appends to the same audit log, preserving previously observed later events. Returning to an unchanged day adds no events. Legacy reconstruction can show a current condition separately from recorded history.
- Contact and intervention document simulated actions. An intervention can remain awaiting evidence. Administrative resolution requires a reason code and note. Evidence-supported resolution and report-correction resolution require a recorded clearance plus current eligible supporting proof. Undo appends a reversal of a specific resolution sequence and keeps the underlying evidence, audit, clock and unrelated decisions.
- State v9 validates lifecycle references and reads compatible v8–v4 saves. Legacy dispositions keep conservative legacy day-level behavior while the trigger records are unsequenced. Legacy contacts have no reliable episode assignment. Preserve the records without inferring missing facts.

## Guided demo, clarity and validation (Phase 6, follow in later phases)
- **Guided demo:** steps and reducer are in src/domain/tour.ts (8 steps, the story of Abu Mohammed; also the demo-video script). Tour state lives in the store (`state.tour`, `store.tour(event)`), so it survives navigation and reloads. START resets to the seed at Day 2; each step carries its own simulated day. `TourPanel` (rendered once in App) navigates on step change, rings the element with the step's `data-tour` attribute, and sits in the first corner that does not cover it. Add `data-tour="…"` to any element a step should point at.
- **Explanations are data** in src/content/glossary.ts: `GLOSSARY` (shown by `<InfoTip term="…">`), `PAGE_INTRO` (one line per console route, dismissible, remembered) and the day-stepper hint. Every new console page needs a `PAGE_INTRO` line.
- **Plain words in the UI, technical names in code and tooltips.** Engine reasons stay technical; show them through `readableReason()`. Use `entityLabel()` for compact pills.
- **Validation:** `npm run validate` writes validation/results.json (read by /validation) and validation/RESULTS.md. It is deterministic and exits non-zero if a gap is missed, a false positive appears or a safety invariant fails. Scenarios come from validation/scenarios.ts (seed 20261114). Parser numbers are reused from parser-results.json and never re-tuned.
- **External check:** put real answers in validation/external-utterances.json, run `npm run eval:external` ONCE with the parser frozen, then `npm run validate`.
- **Honesty rules for numbers:** RESULTS.md starts with the fixed disclaimer. The question-reduction and minutes-saved figures compare against a full script asked every day, which is an assumption and an upper bound. Never present them as measured savings.

## Build phases
1 Setup & shell · 2 Domain core + tests · 3 Saudi-dialect parser + dataset · 4 Clinician dashboard · 5 Patient check-in (voice) · 6 Validation suite · 7 README + deploy.
Work only on the phase you are asked for.
