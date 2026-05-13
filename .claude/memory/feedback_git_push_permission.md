---
name: Git push needs explicit permission
description: Never run git push without explicit user authorization, even on already-committed work
type: feedback
---

Never run `git push` (or `git push --force`, `git push -u`, etc.) without an explicit user request for THAT push.

**Why:** User stated "After my permission git push" — pushing to main bypasses PR review, and authorization granted for one push does not carry over to the next session or commit. The user wants a confirm step every time.

**How to apply:**
- `git add` and `git commit` may proceed when the user asks (e.g. "commit this"), but `git push` always requires a separate explicit ask.
- "git add push commit" / "commit and push" said once does NOT grant blanket push permission for follow-up commits.
- After committing, surface the commit hash and ask "push now?" rather than pushing reflexively.
- This applies to the project's `main` branch in particular, but treat it as the default for all branches in this repo.
