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
    "@moments-plan.md @moments-progress.txt \
1. Read the moments plan (feature spec) and progress file. \
2. Find the next incomplete task in the Implementation Checklist and implement it. \
3. Run pnpm check-types to verify. \
4. Mark the task done in moments-plan.md (check the checkbox). \
5. Append your progress to moments-progress.txt (task name, files changed, outcome). \
6. If you change database schema, run pnpm db:generate and pnpm db:migrate. \
7. Commit your changes. \
ONLY WORK ON A SINGLE TASK. \
If all tasks in the checklist are complete, output <promise>COMPLETE</promise>. \
\
Reference these for patterns and solutions: \
- docs/elysia.md (Elysia framework reference) \
- ARCHITECTURE.md (system design) \
- CLAUDE.md (project conventions and gotchas) \
\
moments-plan.md has the full spec — DB schema, API design, chunking policy, \
ranking formula, and frontend components. Follow it closely." \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$stream_text"

  result=$(jq -r "$final_result" "$tmpfile")

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "Moments feature complete after $i iterations."
    exit 0
  fi
done
