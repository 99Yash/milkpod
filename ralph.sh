#!/bin/bash

claude --permission-mode acceptEdits "@PRD.md @progress.txt \
1. Read the PRD and progress file. \
2. Find the next incomplete task and implement it. \
3. Update progress.txt with what you did. \
4. If you happen to change database schema, run pnpm db:generate and pnpm db:migrate to update the schema. \
ONLY DO ONE TASK AT A TIME. Do not add or commit files. Just tick off the issues.  \
\
Reference these for patterns and solutions: \
- ../../tutorials/total-ts/ (problem/solution pairs — read .solution.ts files) \
- docs/elysia.md (Elysia framework reference) \
- docs/ai-sdk.md (RAG agent guide) \
- AI_SDK_AUDIT.md (prioritized issue list) \
- ARCHITECTURE.md (system design) \
- plan.md (detailed implementation plan with file lists) \
\
When implementing, check plan.md for the specific files to modify and \
what the task entails. Run pnpm check-types after changes to verify."
