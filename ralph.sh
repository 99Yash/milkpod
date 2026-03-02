#!/bin/bash

claude --permission-mode acceptEdits "@PRD.md @plan.md @progress.txt \
1. Read the PRD (audit findings), plan (ordered tasks), and progress file. \
2. Find the next incomplete task in plan.md and implement it. \
3. Update progress.txt with what you did (task number, files changed, outcome). \
4. If you change database schema, run pnpm db:generate and pnpm db:migrate. \
ONLY DO ONE TASK AT A TIME. Do not add or commit files. \
\
Reference these for patterns and solutions: \
- docs/elysia.md (Elysia framework reference) \
- docs/ai-sdk.md (RAG agent guide) \
- ARCHITECTURE.md (system design) \
- CLAUDE.md (project conventions and gotchas) \
\
When implementing, check plan.md for the specific files to modify and \
what the task entails. PRD.md has the 'why' for each finding. \
Run pnpm check-types after changes to verify."
