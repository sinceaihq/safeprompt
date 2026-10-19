# Contributing to SafePrompt

Contributions are welcome — especially **false alarms and missed values from real use** (described with synthetic
look-alikes, never real data), label words in your language, support for more chat sites and new secret formats.

```bash
git clone https://github.com/sinceaihq/safeprompt.git
cd safeprompt
npm ci
npm run lint && npm run typecheck && npm test
npm run build && npx playwright install chromium && npm run test:e2e
```

Load `dist/extension` with _Load unpacked_ in `chrome://extensions` to try your change.

## Where things are

| path                        | what                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `src/engine/`               | detection engine: validators, detectors, secrets, scoring                             |
| `src/ui/`                   | review component, workspace and settings (used by the extension and the web demo)     |
| `src/extension/`            | manifest, background worker, content script, side panel, review dialog, site adapters |
| `web/`                      | the web demo                                                                          |
| `tests/unit/`, `tests/e2e/` | vitest and Playwright tests; e2e replica pages in `tests/e2e/replicas/`               |
| `eval/`                     | validator parity fixtures, SafePrompt-Bench generator and scorer                      |

## Typical changes

- **A missed or wrongly flagged value.** Add a failing test in `tests/unit/engine.test.ts` with a synthetic value,
  fix the engine, and check that `npm test` (which includes the benchmark regression floors) still passes. If scores
  move, rerun `scripts/eval-all.sh` and update `docs/BENCHMARK.md` in the same pull request.
- **A chat site changed its page.** Update its adapter in `src/extension/sites.ts`, update the replica in
  `tests/e2e/harness.ts` to the new markup, and describe how you tested it in `docs/TESTING.md`.
- **A new site.** Add an adapter with `verified: false` and an honest `testing` note, a replica, and e2e tests.
- **A new secret format.** Only formats with a documented prefix or structure; add true and false examples.

## Rules

- Never commit real personal data or real credentials, not even in tests or issues.
- No network requests, no analytics, no remote code. No `innerHTML` (ESLint enforces both).
- New permissions need a reason in `docs/PRIVACY.md` and a note in the pull request.
- Conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`).
- Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
