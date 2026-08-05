---
name: task-plan
description: Turn a repository task brief and its research.md, including inline answers, into an adjacent phased plan.md. Use for the planning stage of a standard .tasks workflow after research and before implementation.
---

# Task Plan

If `update_thread_status` is available in the current harness, use it to publish this skill's state: call `update_thread_status({ operation: "set", label: "📝🏃" })` when planning begins, `update_thread_status({ operation: "set", label: "📝🚫", detail })` immediately before stopping for required user input or outside assistance, and `update_thread_status({ operation: "set", label: "📝✅" })` only after `plan.md` is complete.

1. Resolve the task from the supplied brief or directory. If omitted, find a unique task ID or task-file link in the earliest relevant user message. Ask when ambiguous; never guess from directory recency.
2. Re-read the brief and `research.md` from disk. Check `## Open questions` for inline answers the user may have added since the research was written; do not assume questions remain unanswered without verifying the current file contents. Then read repository instructions and the current code paths the plan will change.
3. If questions are still unanswered or contradictory after rereading `research.md`, ask whether they were intentionally left open before planning. Do not block based solely on the research stage or an earlier snapshot of the file, and do not silently invent decisions.
4. Write `plan.md` beside the brief. Preserve substantive existing plan content unless the user clearly requested a revision.
5. Divide the work into dependency-ordered phases. For each phase, identify concrete files or modules, behavior changes, error cases, tests, documentation, and validation.
6. Include explicit out-of-scope work and completion criteria when they prevent scope drift.
7. Stop after the plan is complete. Do not edit implementation files, create an implementation log, or commit.

Completion requires an actionable `plan.md` consistent with the brief, research, and inline decisions.
