# GitHub Workflow — Patient Financial Navigator

Short rules for collaborating safely on this repository. Commands and setup live
in [../README.md](../README.md); this page is about *how we work*.

## Branches

- **`main` is the stable branch.** It should always pass `npm test`,
  `npm run lint`, `npx tsc --noEmit` and `npm run build`.
- **One short-lived branch per task**, branched from up-to-date `main`:
  `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`,
  `chore/<short-name>`. Delete it after the pull request merges.
- **No direct pushes to `main`** for anything non-trivial; go through a pull
  request.
- Never force-push a branch someone else is working from. If you must rewrite
  your own unpublished branch, prefer `--force-with-lease`.

## Commits

- Commit in small, coherent steps — one idea per commit.
- Write a message that explains **why** the change is needed, not just what
  changed. A short imperative subject line, optional body for the reasoning.
- Do not commit generated build output, `node_modules`, `.next`, or
  `*.tsbuildinfo` (already ignored).
- Keep unrelated formatting or refactoring out of a feature commit.

## Pull requests

- Keep the PR small enough to review in one sitting; describe the change, how it
  was verified (the exact commands and their results), and anything deliberately
  left out.
- Reference the issue or task it addresses.
- **One review approval before merging**, then squash-merge or merge to keep
  `main` readable. Never force-push over someone else's review.
- If a check fails, fix the cause. Do not disable, skip, or loosen a test,
  lint rule, or type to get green.

## Secrets and patient data

This is the rule that matters most:

- **Never commit secrets** — API keys, database credentials, service-role keys,
  tokens, or `.env` files. Use environment variables and document placeholder
  names in a `.env.example` when a later stage needs them; keep real values
  local. If a secret is ever committed, treat it as compromised and rotate it.
- **Never commit real patient documents or data** — no hospital bills, scans,
  PDFs, spreadsheets, or exports. `.gitignore` blocks `uploads/`, `patient-docs/`,
  `patient-data/`, `.env*`, `*.pdf`, `*.docx`, `*.xlsx` and `*.csv` for exactly
  this reason. All fixtures must be **synthetic**.
- Keep documentation honest: mark anything not implemented as planned, and never
  claim a feature, integration, or test result that has not been verified.
