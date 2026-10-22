---
name: gate-and-commit
description: >-
  Runs the repo's gate — `npx tsc --noEmit`, `npm run lint`, `npx vitest run` — and when every
  step is green, commits the change without pushing. A failing step is reported with a suggested
  fix and is never fixed automatically. Use when the user says gate-and-commit, /gate-and-commit,
  "run the gate", "check and commit", or asks to verify the current changes and commit them.
compatibility: opencode
---

# gate-and-commit

⭐ **This skill is the owner's sanctioned exception to AGENTS.md H1.** It runs `npx`, `npm` and
`git`; nothing else in the repo does that on its own. Everything else about the rules still
holds — the repo's commands, its invariants and its no-autopilot rule.

## The steps

| # | Step | Command | On failure |
|---|------|---------|-----------|
| 1 | types | `npx tsc --noEmit` | **stop** · report · suggest a fix · do not fix it |
| 2 | lint | `npm run lint` | **stop** · report · suggest a fix · do not fix it |
| 3 | tests | `npx vitest run` | **stop** · report · suggest a fix · do not fix it |
| 4 | commit | `git add` + `git commit` | — |

⭐ **Stop at the first failing step.** A type error usually explains the lint error and the red
tests, so running the rest only adds noise. Report the first failure, in full.

⭐ **Never auto-fix.** Name the file, the line and the cause, then state the fix you would make
— and stop. The owner says yes or no. (AGENTS.md: no autopilot.)

⭐ **The repo's full gate has a fourth step — `npm run build`.** It is the owner's, not this
skill's: offer it, do not run it.

## Before the gate

Determine the **platform** first — it decides the shell's syntax for anything composite (a
chained command, an env var). The environment block states it; if it is unknown, ask.

| Platform | Chaining | Env var | Copy |
|---|---|---|---|
| **bash / zsh** (Linux, macOS) | `cmd1 && cmd2` | `NAME="value" cmd` | `cp` |
| **PowerShell** (Windows) | `cmd1; if ($?) { cmd2 }` | `$env:NAME = "value"` | `Copy-Item` |

The three gate commands and the git commands are the **same on both** — run them one at a time,
never chained, and the platform does not matter.

## The commit

Only when all three steps are green.

1. **Look before committing.** `git status`, `git diff`, `git log --oneline -10`. ⭐ Stage only
   the intended files. ⭐ If the diff holds anything unintended — a secret, a stray artefact, a
   generated file — **stop and say so**; do not commit it.
2. **Match the repo's message style** — read it off `git log --oneline -10`, not from habit.
3. **Commit; never push.** `git commit -m "<message>"` (repeat `-m` for a body). ⭐ **No push**,
   no amend, no force, no branch or remote operations.
4. **Report** the commit hash, the files, and the gate's result.

## Report shape

- **Green:** the three steps' results, the commit hash, the files.
- **Red:** the failing step, its output (trimmed to the cause), the file and line, and the
  suggested fix — offered, not applied.
