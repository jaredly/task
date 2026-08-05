---
name: task-bugfix
description: Reproduce, investigate, fix, verify, log, and commit a repository bug described by task.md. Use when a regression test should demonstrate the defect before the fix.
---

# Task Bugfix

If `update_thread_status` is available in the current harness, use it to publish this skill's state: call `update_thread_status({ operation: "set", label: "👷🏃" })` when bugfix implementation begins, `update_thread_status({ operation: "set", label: "👷🚫", detail })` immediately before stopping for required user input or outside assistance, and `update_thread_status({ operation: "set", label: "👷✅" })` only after verified reproduction, fix, an accurate `implementation-log.md`, and a scoped commit.

1. Resolve the bug from the supplied `task.md` or task directory, or infer a unique task ID/link from the earliest relevant user message. Ask when ambiguous.
2. Read repository instructions, the report, related code and tests, working-tree status, and relevant history.
3. Create the smallest reliable failing reproduction test before changing production behavior. If reproduction is impossible with available information, stop and ask rather than guessing at a fix.
4. Investigate the root cause, implement the narrowest coherent fix, and run the reproduction plus relevant broader verification.
5. Create or update `implementation-log.md` beside `task.md`. Record the reproduction, cause, fix, verification, issues, and workarounds concisely.
6. Preserve unrelated working-tree changes and avoid opportunistic refactors.
7. Review the final diff, stage only bug-related files, and create a detailed commit. Ask before staging when unrelated work overlaps the same files or scope is ambiguous.

Completion requires a regression test that failed for the reported behavior and passes with the fix, relevant verification, an accurate log, and a scoped commit.
