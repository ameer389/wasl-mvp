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
Vite + React + TypeScript, Tailwind CSS v4 (@tailwindcss/vite), React Router with HashRouter (GitHub Pages), Vitest. No backend: state in memory + localStorage with "Reset demo". Voice: Web Speech API (webkitSpeechRecognition, lang 'ar-SA') with button/text fallback. Deploy: GitHub Pages via GitHub Actions; Vite base comes from one constant ('/wasl-mvp/').

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

## Build phases
1 Setup & shell · 2 Domain core + tests · 3 Saudi-dialect parser + dataset · 4 Clinician dashboard · 5 Patient check-in (voice) · 6 Validation suite · 7 README + deploy.
Work only on the phase you are asked for.
