#!/bin/bash

claude --permission-mode acceptEdits "@PRD.md @progress.txt \
1. Read the PRD and progress file. \
2. Find the next incomplete task and implement it. \
3. Commit your changes. \
4. Update progress.txt with what you did. \
ONLY DO ONE TASK AT A TIME. \
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
