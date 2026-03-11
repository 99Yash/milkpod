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
    "@distill-plan.md @distill-progress.txt @docs/ai-sdk-v6-patterns.md @docs/typescript-patterns.md \
You are distilling coding patterns from tutorial exercises into concise, actionable reference docs. \
\
1. Read the distill plan and progress file. Find the next incomplete task. \
2. For the task, read EVERY solution file in the listed directory. Also read explainer files if they exist. \
   - For AI SDK tasks: read all */solution/api/*.ts, */solution/client/*.tsx, */solution/main.ts, */explainer/main.ts \
   - For TS tasks: read all *.solution.ts and *.solution.tsx files in the chapter directory \
3. For each exercise, identify: \
   a) The CORE pattern being taught — what is the one thing this exercise demonstrates? \
   b) The ANTI-PATTERN it replaces — what would you do wrong without this knowledge? \
   c) WHEN to use it — concrete scenarios in a production codebase (data fetching, auth, streaming, etc.) \
   d) The MINIMAL code example — shortest possible snippet that captures the pattern \
4. Compare what you found against the existing reference doc (ai-sdk-v6-patterns.md or typescript-patterns.md): \
   - Is this pattern already covered? If so, is the existing coverage accurate and complete? \
   - Are there nuances, options, or edge cases the existing doc misses? \
   - Are there anti-patterns the tutorial warns about that the doc doesn't mention? \
5. UPDATE the reference doc with any improvements: \
   - Add missing patterns with minimal code examples \
   - Fix inaccuracies (wrong option names, outdated API signatures) \
   - Add anti-pattern entries to the anti-patterns table \
   - Add 'when to use' context where missing \
   - Keep it CONCISE — this is a reference doc, not a tutorial. One example per pattern. \
   - Do NOT bloat the doc with redundant examples or verbose explanations \
6. Mark the task done in distill-plan.md (strikethrough + checkmark). \
7. Append findings to distill-progress.txt: \
   - Task name \
   - Patterns found (bullet list) \
   - What was added/updated in the reference doc \
   - What was already covered and didn't need changes \
\
ONLY WORK ON A SINGLE TASK. Read every solution file — don't skip any. \
The goal is reference docs that are accurate, complete, and concise — a developer should be able to look up any pattern and get the correct v6/TS syntax instantly. \
If all tasks in distill-plan.md are complete, output <promise>COMPLETE</promise>." \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$stream_text"

  result=$(jq -r "$final_result" "$tmpfile")

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "Distillation complete after $i iterations."
    exit 0
  fi
done
