#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 [iterations] [plan-file] [progress-file]"
  echo "  iterations defaults to 100 (loop exits early on <promise>COMPLETE</promise>)"
  echo "  plan-file defaults to plan.md"
  echo "  progress-file defaults to progress.txt"
  echo ""
  echo "Examples:"
  echo "  $0 10                                             # 10 iterations, default plan/progress"
  echo "  $0 replicache-plan.md replicache-progress.txt     # default iterations, custom files"
  echo "  $0 43 replicache-plan.md replicache-progress.txt  # explicit iterations + files"
  exit 1
fi

# First arg is iterations only if it's numeric; otherwise treat all args as files
if [[ "$1" =~ ^[0-9]+$ ]]; then
  iterations="$1"
  shift
else
  iterations=100
fi

plan_file="${1:-plan.md}"
progress_file="${2:-progress.txt}"

if [ ! -f "$plan_file" ]; then
  echo "Error: plan file '$plan_file' not found" >&2
  exit 1
fi

# Ensure the progress file exists so the @ reference resolves
[ -f "$progress_file" ] || : > "$progress_file"

# jq filter to extract streaming text from assistant messages
stream_text='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty | gsub("\n"; "\r\n") | . + "\r\n\n"'

# jq filter to extract final result
final_result='select(.type == "result").result // empty'

for ((i=1; i<=iterations; i++)); do
  tmpfile=$(mktemp)
  trap "rm -f $tmpfile" EXIT

  echo "━━━ Iteration $i/$iterations (plan=$plan_file, progress=$progress_file) ━━━"

  claude --permission-mode bypassPermissions \
    --print \
    --output-format stream-json --verbose \
    "@review-prompt.md @$plan_file @$progress_file \
1. Read the review prompt (comprehensive checklists + nudges + library leverage guide), plan (ordered tasks), and progress file. \
2. Find the next incomplete task in $plan_file. \
3. For every file in the task: run git diff main -- <file> to see changes, then read full file for context. \
4. BEFORE fixing anything: verify library APIs by reading .d.ts files in node_modules and searching library GitHub repos via mcp__grep__searchGitHub. \
   Check if hand-rolled code duplicates a library primitive (Drizzle relational queries, Elysia guards/onError, AI SDK Output, Eden type inference). \
5. Apply EVERY relevant checklist item from review-prompt.md (backend, frontend, library leverage, or all). \
6. Fix issues directly in the code. Replace hand-rolled logic with library primitives where the library supports it. Note issues you can't fix with justification. \
7. Run pnpm check-types to verify no regressions. \
8. Mark the task done in $plan_file (strikethrough + checkmark). \
9. Append detailed findings to $progress_file (issues found+fixed, issues noted, library improvements made, checklist verification). \
10. Commit your changes. \
ONLY WORK ON A SINGLE TASK. Be thorough — check every catch block, every fetch call, every switch statement, every useEffect. \
For every piece of non-trivial logic, ask: does the library already do this? Read the .d.ts or search GitHub to find out. \
If all tasks in $plan_file are complete, output <promise>COMPLETE</promise>. \
\
Reference these for patterns and solutions: \
- docs/ai-sdk-v6-patterns.md (AI SDK v6 API reference — tools with inputSchema, stopWhen, createUIMessageStream, writer, streamObject, onFinish, onError, guardrails, model routing, iterative refinement) \
- docs/typescript-patterns.md (TypeScript patterns — discriminated unions, branded types, type guards, generics, satisfies, mapped types, exhaustive switches, React component typing) \
- docs/elysia.md (Elysia framework reference — guards, derive, lifecycle hooks) \
- docs/ai-sdk.md (RAG agent guide — embeddings, retrieval, vector databases) \
- ARCHITECTURE.md (system design, data flow) \
- CLAUDE.md (project conventions, gotchas, package boundaries, env vars) \
- node_modules/.pnpm/<pkg>@*/node_modules/<pkg>/dist/*.d.ts for actual library type signatures \
- mcp__grep__searchGitHub to search elysiajs/elysia, drizzle-team/drizzle-orm, vercel/ai, etc. for API usage examples \
\
review-prompt.md has the full review checklists, library leverage guide, TS patterns, composability principles, and high-signal nudges from prior reviews. $plan_file has the task list. $progress_file has completed work." \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$stream_text"

  result=$(jq -r "$final_result" "$tmpfile")

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "Review complete after $i iterations."
    exit 0
  fi
done
