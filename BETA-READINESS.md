# Beta Readiness — Follow-Up Plan

Companion to the "not quite ready" call: what's actually blocking beta, what's just cosmetic, and one concrete project to dogfood the app on while you finish tuning.

---

## 1. The real blocker: no documented "known-good" default config

You said it yourself — you're still figuring out what configuration gives good results. That's fine for you, but a beta tester has no way to tell "the app is broken" apart from "I picked a bad model." Every AI-driven page (Documents AI Edit, Project Layers generation, Mockups, Generate Workflows, Workflows runner, Test Generator, Issues analysis, Issue Runner, AI Chat) is only as good as the model behind it, and they don't all need the same kind of model.

**What to do:** as you test, keep a running log of what worked per page, then fold it into Settings or the README as a "Recommended Setup" table. You don't need a final answer for every page before beta — you need *some* documented starting point so testers aren't guessing blind. A structure like this is enough to start:

| Page | What the model needs to be good at | What you've tried | Best so far |
|---|---|---|---|
| Project Layers generation | Structured JSON output, architecture reasoning | | |
| Documents AI Edit | Long-context editing, following instructions precisely | | |
| Mockups generation | HTML/CSS generation, following a style guide literally | | |
| Generate Workflows | Multi-step planning, strict JSON schema adherence, staying under word limits per field | | |
| Workflows / Issue Runner execution | Tool-use / agentic coding, multi-file edits, running build commands | | |
| Test Generator | Framework-specific test idioms | | |
| AI Chat (Smart Context) | Writing correct SQL against a given schema | | |

Two things worth testing explicitly, since they're structurally different from the rest:
- **Generate Workflows** has the strictest output contract (JSON array, per-field word limits, exact layer-name matching) of anything in the app — a model that's great at Documents AI Edit can still fail this one by writing prose where JSON is expected. Test it separately.
- **Model Mapping** (Settings) lets you assign different models per page — so "one best model" may not even be the right target. It's fine, maybe better, for the documented default to be per-page.

---

## 2. Rough edges found in this pass

Concrete, not speculative — found by reading the actual code and test suite.

### Stale/broken e2e tests referencing removed pages
Three spec files test UI that no longer exists as a route (confirmed against `src/renderer/app.js`'s registered routes):
- `tests/e2e/prompt-queue.spec.js` — tests the removed Prompt Queue page
- `tests/e2e/test-runner.spec.js` — tests Test Runner as a standalone page; it's now merged into Test Generator
- `tests/e2e/user-stories.spec.js` — tests a `user-stories`/`extract-user-stories` flow that isn't in the registered route list either

`npx playwright test --list` still enumerates 262 tests across all 11 spec files without erroring, but running these three will fail against selectors/routes that no longer exist. **Before beta, either delete these three files or rewrite them against Test Generator / Issue Runner** — a red CI run from known-dead tests will mask real regressions, and any tester who runs `npm test` will see failures unrelated to their own changes.

### Dead backend scaffolding surfaced in the UI
Already flagged in the README pass, repeating here because it's a beta-facing issue, not just doc hygiene:
- Settings → Telegram still shows "Prompt Queue — Job Started/Completed/Failed" notification cards that no longer fire.
- `queue:*` IPC channels and the `prompt_queue`/`prompt_queue_messages` tables are dead code paths.

A tester who configures Telegram notifications for the Prompt Queue cards and never gets pinged will assume the feature is broken. Either hide those three cards or wire them to nothing visibly (e.g. remove them) before beta.

### Things that checked out fine (don't need work)
- Every AI-driven page uses the shared `ModelPicker` component, which correctly disables run actions when no model is selected (checked `ai-console-page.js`, `test-generator-page.js`) — no missing-model crash risk found.
- `chat-handlers.js` has explicit `catch` blocks around every streaming call path (8 found) — AI call failures don't appear to be silently swallowed.

---

## 3. Suggested pre-beta checklist

- [ ] Delete or fix `prompt-queue.spec.js`, `test-runner.spec.js`, `user-stories.spec.js`
- [ ] Remove or hide the three dead Telegram "Prompt Queue" notification cards
- [ ] Run `npm test` clean (or with only known/intentional skips) at least once
- [ ] Document a starting "Recommended Setup" — even a partial one — for Settings/README
- [ ] Do one full end-to-end run using the example project below, using [How-To-Use.md](How-To-Use.md)'s first-week workflow, and note anywhere the docs and the actual behavior diverge

---

## 4. Example project to dogfood the tool

A small **Personal Expense Tracker** — big enough to exercise every page end-to-end, small enough to finish in a day or two. It deliberately uses two layers with different tech stacks so you can compare model behavior across languages while you tune config — directly useful for section 1 above.

**Layers:**
- `Backend API` — Node or Python REST API (pick whichever you're most fluent in, so you can actually judge AI output quality). Owns all Firestore reads/writes. Endpoints: `POST/GET/PATCH/DELETE /expenses` (with date-range + category filters), `GET/POST /categories`, `GET /summary` (today/week/month/last-month totals, computed server-side), Firebase Auth token verification on every route.
- `Mobile App` — Flutter, since the README's test generator and mockup templates both have first-class Flutter support, and it's a good stress test for the "UI Shell → Wire Up" Generate Workflows pattern.

**Screens (from Mockups' built-in templates):**
- Login (Authentication category)
- Dashboard — today/week/month/last-month totals via `GET /summary`
- Expense list with filters (today, week, month, month picker) and category grouping
- Add/Edit expense form (amount, category, date, note) + delete
- Settings — category management

Firestore/Firebase Auth were deliberately chosen over direct Flutter-to-Firestore access — keeping a real backend layer is what makes this exercise DevFlow AI's Test Generator across two different stacks and gives Model Mapping something to differentiate, which a single-layer app wouldn't.

**Why this shape specifically:**
- Two layers with different languages forces you to validate Test Generator's language auto-detection (Python/pytest vs. Flutter/Dart) and lets you see whether one model config handles both well or whether Model Mapping should differ per layer.
- The Dashboard and Transaction List screens are complex enough (data-dependent, filtering, computed values) to actually stress-test the "UI Shell then Wire Up" Generate Workflows split — simple static screens like Settings won't reveal problems that a data-heavy screen will.
- A CRUD-shaped domain (expenses) gives Issues/Issue Runner real, plausible bugs to track and batch-fix (validation edge cases, date handling, currency rounding) instead of synthetic ones.
- Small enough total scope that you can run the *entire* pipeline — Layers → Style Guide → Documents → Mockups → Generate Workflows → Workflows run → Test Generator → Security Scan → Issues — more than once as you adjust config, rather than getting stuck mid-project on one giant app.

**Suggested run order**, following [How-To-Use.md](How-To-Use.md) section 14:
1. Write a one-page Project Overview doc (Backend API + Flutter app, expenses/categories/summary).
2. Generate Project Layers from it; fix folder paths to real git repos.
3. Pick or tweak a Style Guide preset.
4. Generate the Login and Dashboard mockups first — they're the two most likely to expose model weaknesses early.
5. Generate Workflows from the Dashboard mockup (the most complex screen) and Run All.
6. Check Git Changes, commit.
7. Test Generator on both layers — compare quality/usefulness of Python vs. Flutter test output.
8. Security Scan on the Backend API layer.
9. Log at least one real issue you hit along the way, then use Issue Runner to fix it.

If this full loop completes cleanly with a documented config, that's a good signal you're ready to open beta.
