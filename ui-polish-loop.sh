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
    "@ui-polish-plan.md @ui-polish-progress.txt @docs/ui-polish-patterns.md \
You are applying UI polish patterns from a reference doc to a real Next.js + Tailwind codebase. \
\
1. Read the plan and progress file. Find the next incomplete task. \
2. For the task, read EVERY file listed under 'Files to audit'. \
3. For each file, check which reference patterns apply and whether the file already follows them. \
4. For patterns that are NOT yet applied, make the changes: \
   - Use Tailwind classes where possible (e.g. text-balance, antialiased, tabular-nums) \
   - For shadows/outlines, use Tailwind arbitrary values or globals.css \
   - For animations, prefer CSS @keyframes in globals.css + Tailwind arbitrary classes, or Motion if already used \
   - Keep changes minimal — do not refactor unrelated code \
   - Do not break existing functionality or remove existing styles unless replacing them \
5. After applying changes, verify the file still type-checks (run pnpm check-types if unsure). \
6. Mark the task done in ui-polish-plan.md (strikethrough + checkmark). \
7. Append findings to ui-polish-progress.txt: \
   - Task name \
   - Changes made per file (bullet list) \
   - Patterns that were already applied (no changes needed) \
   - Any issues or decisions made \
\
ONLY WORK ON A SINGLE TASK. Read every listed file — don't skip any. \
The goal is subtle, high-quality polish — not visual overhauls. Each change should be small and intentional. \
If all tasks in ui-polish-plan.md are complete, output <promise>COMPLETE</promise>." \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$stream_text"

  result=$(jq -r "$final_result" "$tmpfile")

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "UI polish complete after $i iterations."
    exit 0
  fi
done
