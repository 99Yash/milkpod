#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

for ((i=1; i<=$1; i++)); do
  echo "=== Iteration $i ==="
  tmpfile=$(mktemp)

  claude --permission-mode bypassPermissions --output-format stream-json --verbose \
    "@remove-bt.md \
1. Read the plan file. \
2. Find the next incomplete task (marked ## Task, not ## [x] Task) and implement it. \
3. Run pnpm check-types to verify no type errors. \
4. Mark the task as done by changing '## Task' to '## [x] Task' in remove-bt.md. \
ONLY DO ONE TASK AT A TIME. Do not add or commit files. Just tick off the tasks. \
If all tasks are complete, output <promise>COMPLETE</promise>." \
    | grep --line-buffered '^{' \
    | tee "$tmpfile" \
    | jq --unbuffered -r 'select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text | gsub("\n"; "\r\n")'

  if grep -q "COMPLETE" "$tmpfile"; then
    echo "All tasks complete after $i iterations."
    rm -f "$tmpfile"
    exit 0
  fi

  rm -f "$tmpfile"
done
