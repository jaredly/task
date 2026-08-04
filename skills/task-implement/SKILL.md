---
name: task-implement
description: Implement and verify a planned standard repository task while maintaining implementation-log.md. Use only for the standard implementation stage after task-plan; it stops before commit.
---

# Task Implement

1. Resolve the task from the supplied brief or directory, or infer a unique task ID/link from the earliest relevant user message. Ask for a path when ambiguous.
2. Confirm this is a standard task rather than a `-simple-` or `-bug-` task. Simple tasks use `$task-simple`; bugs use `$task-bugfix`.
3. Read the brief, `research.md`, `plan.md`, repository instructions, working-tree status, and relevant code and tests. If `plan.md` is missing or incomplete, stop and ask for the planning stage; do not perform research or planning inside this skill.
4. Create or update `implementation-log.md` beside the brief. Keep it concise and record completed phases, verification, issues, workarounds, and remaining work.
5. Preserve unrelated working-tree changes. Make scoped edits using repository patterns, add risk-appropriate tests, and verify each phase before continuing.
6. Do not declare completion while required tests or plan items remain. Explain genuine blockers and leave the log accurate.
7. Stop after verified implementation without committing; `$task-commit` owns that stage.

Completion requires verified behavior and an accurate `implementation-log.md`. Do not commit.
