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
