#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

# jq filter to extract streaming text from assistant messages
stream_text='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty | gsub("\n"; "\r\n") | . + "\r\n\n"'

# jq filter to extract final result
final_result='select(.type == "result").result // empty'

for ((i=1; i<=$1; i++)); do
  tmpfile=$(mktemp)
  trap "rm -f $tmpfile" EXIT

  claude --permission-mode bypassPermissions \
    --print \
    --output-format stream-json --verbose \
    "@docs/client-side-checks-plan.md @client-side-checks-progress.txt @docs/client-side-checks-prd.md \
You are implementing client-side quota and entitlement pre-checks for a Next.js + Elysia codebase. \
\
1. Read the plan and progress file. Find the next incomplete task (unchecked checkbox). \
2. For the task, read EVERY file listed under 'Files'. \
3. Read existing utilities the task depends on (e.g. plan-cache.ts, handleUpgradeError). Understand the existing patterns before writing code. \
4. Implement the changes described in the task: \
   - Follow existing code patterns (import style, error handling, toast usage). \
   - Keep changes minimal — do not refactor unrelated code. \
   - Respect the principles in the PRD: server is authority, client checks are optimistic fast-paths, admin bypass. \
   - Do not break existing functionality. \
5. After implementing, verify the file still type-checks (run pnpm check-types if unsure). \
6. Mark the task's checkboxes done in client-side-checks-plan.md (- [x]). \
7. Append findings to client-side-checks-progress.txt: \
   - Task name \
   - Changes made per file (bullet list) \
   - Any decisions or issues encountered \
\
ONLY WORK ON A SINGLE TASK (one numbered section like 1.1, 1.2, etc.). Read every listed file — don't skip any. \
The goal is correct, minimal implementation that matches existing patterns. Each change should be small and intentional. \
If all tasks in client-side-checks-plan.md are complete, output <promise>COMPLETE</promise>." \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$stream_text"

  result=$(jq -r "$final_result" "$tmpfile")

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "Client-side checks complete after $i iterations."
    exit 0
  fi
done
