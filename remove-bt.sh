#!/bin/bash

claude --permission-mode acceptEdits "@remove-bt.md \
1. Read the plan file. \
2. Find the next incomplete task (tasks are numbered 1-9, work in order). \
3. Implement it following the instructions in the plan. \
4. After implementation, run pnpm check-types to verify no type errors. \
5. Mark the task as done by adding a [x] prefix to its heading in remove-bt.md. \
ONLY DO ONE TASK AT A TIME. Do not add or commit files. Just tick off the tasks."
