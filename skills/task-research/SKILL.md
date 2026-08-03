---
name: task-research
description: Research a repository task brief and write an adjacent research.md with findings, alternatives, constraints, and open questions. Use for the research stage of a standard .tasks workflow before planning or implementation.
---

# Task Research

1. Resolve the task from the supplied Markdown brief or task directory. If no path is supplied, find a unique task ID or task-file link in the earliest relevant user message. Ask for a path if that is ambiguous; never select the newest task implicitly.
2. Read the brief, repository instructions, relevant implementation, tests, documentation, and recent history. Verify current or niche external facts against primary sources when needed.
3. Write `research.md` beside the brief. Update an existing file only when the request clearly continues that research; otherwise ask before replacing substantive content.
4. Explain the current behavior, feasible approaches, important tradeoffs, compatibility or migration concerns, and a recommendation. Cite repository paths and external sources where useful.
5. End with `## Open questions`. Record every decision needed before a reliable plan can be written, or state that there are none.
6. Stop after the research artifact is complete. Do not write `plan.md`, edit product code, implement, or commit.

Completion requires a reviewed `research.md` that gives the next agent enough context to plan without repeating the investigation.
