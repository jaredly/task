---
name: task-simple
description: Implement, verify, log, and commit a compact simple task described by task.md. Use for simple-kind .tasks workflows that intentionally skip research and planning.
---

# Task Simple

If `update_thread_status` is available in the current harness, use it to publish this skill's state: call `update_thread_status({ operation: "set", label: "👷🏃" })` when implementation begins, `update_thread_status({ operation: "set", label: "👷🚫", detail })` immediately before stopping for required user input or outside assistance, and `update_thread_status({ operation: "set", label: "👷✅" })` only after verified implementation, an accurate `implementation-log.md`, and a scoped commit.

1. Resolve the task from the supplied `task.md` or task directory, or infer a unique task ID/link from the earliest relevant user message. Ask for a path when ambiguous.
2. Read the brief, repository instructions, relevant code and tests, and working-tree status.
3. Do not require, create, or backfill `research.md` or `plan.md`. A simple task starts directly from its brief. Ask only questions that block a safe implementation; otherwise proceed.
4. Implement the narrowest coherent change using repository patterns. Preserve unrelated working-tree changes and avoid opportunistic refactors.
5. Create or update `implementation-log.md` beside the brief. Record the change, verification, issues, and workarounds concisely.
6. Add risk-appropriate tests and run relevant verification. Do not declare completion while required behavior is unverified or tests are failing.
7. Review the final diff, stage only simple-task-related files, and create a detailed commit. Ask before staging when unrelated work overlaps the same files or scope is ambiguous.

Completion requires the requested behavior, passing relevant verification, an accurate `implementation-log.md`, and a scoped commit. Research and planning artifacts are not prerequisites.
