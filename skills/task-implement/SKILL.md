---
name: task-implement
description: Implement a planned standard repository task or a compact simple task while maintaining implementation-log.md. Use for the implementation stage of .tasks workflows; standard tasks stop before commit, while simple tasks verify and commit their scoped changes.
---

# Task Implement

1. Resolve the task from the supplied brief or directory, or infer a unique task ID/link from the earliest relevant user message. Ask for a path when ambiguous.
2. Infer the task kind from its directory name. Read the brief, repository instructions, working-tree status, and existing task artifacts.
3. For a standard task, require and follow `plan.md` phase by phase. For a simple task, inspect the affected code and ask only blocking questions; proceed directly when the scope is clear.
4. Create or update `implementation-log.md` beside the brief. Keep it concise and record completed phases, verification, issues, workarounds, and remaining work.
5. Preserve unrelated working-tree changes. Make scoped edits using repository patterns, add risk-appropriate tests, and verify each phase before continuing.
6. Do not declare completion while required tests or plan items remain. Explain genuine blockers and leave the log accurate.
7. For standard tasks, stop after verified implementation without committing; `$task-commit` owns that stage.
8. For simple tasks, review the final diff, stage only task-related files, and create a detailed commit. If unrelated changes overlap the same files or the commit scope is ambiguous, ask before staging.

Completion requires verified behavior and an accurate `implementation-log.md`; simple tasks additionally require the scoped commit.
