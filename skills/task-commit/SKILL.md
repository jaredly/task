---
name: task-commit
description: Review and commit the completed changes for a standard repository task after task-implement. Use when plan.md has been implemented and implementation-log.md records successful verification, but the task remains uncommitted.
---

# Task Commit

If `update_thread_status` is available in the current harness, use it to publish this skill's state: call `update_thread_status({ operation: "set", label: "👍🏃" })` when commit work begins, `update_thread_status({ operation: "set", label: "👍🚫", detail })` immediately before stopping for required user input or outside assistance, and `update_thread_status({ operation: "set", label: "👍✅" })` only after the scoped commit is created.

1. Resolve the task from the supplied brief or directory, or infer a unique task ID/link from the earliest relevant user message. Ask when ambiguous.
2. Read the brief, `plan.md`, `implementation-log.md`, repository instructions, working-tree status, and the complete diff.
3. Confirm every required plan phase is complete and verification is recorded. If implementation is incomplete or tests are failing, report the gap and stop without committing.
4. Identify task-related paths from the plan, log, and diff. Preserve unrelated changes, including unrelated hunks in otherwise relevant files.
5. Stage only the task-related changes. If clean separation is not possible or authorship is unclear, ask before staging.
6. Inspect the staged diff and create one detailed commit describing the behavior, important implementation choices, and verification.
7. Report the commit identifier and any intentionally uncommitted changes.

Completion requires a successful scoped commit with no unrelated changes staged.
