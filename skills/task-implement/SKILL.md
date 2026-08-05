---
name: task-implement
description: Implement and verify a planned standard repository task while maintaining implementation-log.md. Use only for the standard implementation stage after task-plan; it stops before commit.
---

# Task Implement

If `update_thread_status` is available in the current harness, use it to publish this skill's state: call `update_thread_status({ operation: "set", label: "👷🏃" })` when implementation begins, `update_thread_status({ operation: "set", label: "👷🚫", detail })` immediately before stopping for required user input or outside assistance, and `update_thread_status({ operation: "set", label: "👷✅" })` only after verified implementation and an accurate `implementation-log.md`.

1. Resolve the task from the supplied brief or directory, or infer a unique task ID/link from the earliest relevant user message. Ask for a path when ambiguous.
2. Read the brief, `research.md`, `plan.md`, repository instructions, working-tree status, and relevant code and tests. If `plan.md` is missing or incomplete, stop and ask for the planning stage; do not perform research or planning inside this skill.
3. Create or update `implementation-log.md` beside the brief. Keep it concise and record completed phases, verification, issues, workarounds, and remaining work.
4. Preserve unrelated working-tree changes. Make scoped edits using repository patterns, add risk-appropriate tests, and verify each phase before continuing.
5. Do not declare completion while required tests or plan items remain. Explain genuine blockers and leave the log accurate.
6. Stop after verified implementation without committing; `$task-commit` owns that stage.

Completion requires verified behavior and an accurate `implementation-log.md`. Do not commit.
