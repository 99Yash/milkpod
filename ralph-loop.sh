#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

for ((i=1; i<=$1; i++)); do
  result=$(claude --permission-mode bypassPermissions "@PRD.md @plan.md @progress.txt \
1. Read the PRD, plan, and progress file. \
2. Find the next incomplete task and implement it. \
3. Run your tests and type checks (pnpm check-types). \
4. Update the PRD with what was done. \
5. Append your progress to progress.txt. \
6. If you change database schema, run pnpm db:generate and pnpm db:migrate. \
7. Commit your changes. \
ONLY WORK ON A SINGLE TASK. \
If the PRD is complete, output <promise>COMPLETE</promise>. \
\
Reference these for patterns and solutions: \
- ../../tutorials/total-ts/ (problem/solution pairs — read .solution.ts files) \
- docs/elysia.md (Elysia framework reference) \
- docs/ai-sdk.md (RAG agent guide) \
- AI_SDK_AUDIT.md (prioritized issue list) \
- ARCHITECTURE.md (system design) \
- plan.md (detailed implementation plan with file lists)")

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "PRD complete after $i iterations."
    exit 0
  fi
done
