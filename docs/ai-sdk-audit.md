# AI SDK Audit: Milkpod vs. Best Practices

> Compared against: [ai-sdk-v5-crash-course](https://github.com/ai-hero-dev/ai-sdk-v5-crash-course) (AI SDK v6, `ai@6.0.5`) and official AI SDK documentation.

---

## 0. Version Gap (Critical)

**Milkpod is on v5 canary. The crash course (and stable release) is on v6.**

| Package | Milkpod (current) | Crash Course / Stable |
|---------|-------------------|-----------------------|
| `ai` | `5.0.129` (canary) | `6.0.5` |
| `@ai-sdk/openai` | `2.0.89` | `^3.0.2` |
| `@ai-sdk/react` | `2.0.131` | `3.0.5` |

### Action Required

Upgrade to AI SDK v6 stable. The canary API surface has been finalized in v6 with these breaking changes:

1. **`convertToModelMessages()` is now async** — Milkpod already awaits it, so no code change needed here.
2. **MCP imports moved** — `createMCPClient` → `@ai-sdk/mcp` (not used yet, but relevant if added later).
3. **`stopWhen` takes an array** — v6 uses `stopWhen: [stepCountIs(n)]` (array), Milkpod currently uses `stopWhen: stepCountIs(n)` (bare value). Needs update.
4. **New `@ai-sdk/devtools`** package available for development.

```bash
# Catalog update in pnpm-workspace.yaml
ai: ^6.0.0
"@ai-sdk/openai": ^3.0.0
"@ai-sdk/react": ^3.0.0
```

---

## 1. What Milkpod Does Well

### Tool Generators (Async Iterators)
`packages/ai/src/tools.ts` — Uses `async function*` for two-phase tool results (preliminary → final). This is an advanced pattern that the crash course doesn't even cover. The frontend correctly detects `part.preliminary === true` for streaming states.

### Context Injection via Tool Factories
`createQAToolSet(context)` closes over `assetId`/`collectionId` so the LLM never chooses which tenant to query. This is a security best practice — prevents prompt injection from leaking cross-tenant data.

### Centralized Provider Config
`packages/ai/src/provider.ts` — Single source of truth for model instances with proper typing (`LanguageModel`, `EmbeddingModel<string>`).

### Message Conversion
Already uses `await convertToModelMessages()` (v6-compatible).

### `isToolOrDynamicToolUIPart()` Type Guard
`apps/web/src/components/chat/message.tsx` — Uses the SDK's official type guard instead of raw string matching.

### Custom Transport with Header Extraction
`useMilkpodChat` wraps `fetch` to extract `X-Thread-Id` from response headers. Clean pattern for server-generated IDs.

### Persistence via `onFinish`
Chat endpoint saves assistant messages in the `onFinish` callback of `toUIMessageStreamResponse()` — exactly what the crash course recommends.

---

## 2. Issues to Fix Now

### 2.1 `stopWhen` Syntax (Breaking in v6)

**File:** `packages/ai/src/stream.ts:28`

```typescript
// Current (v5 syntax)
stopWhen: stepCountIs(5),

// Required (v6 syntax — array)
stopWhen: [stepCountIs(5)],
```

The v6 API accepts an array of stop conditions, allowing composition (e.g., stop on step count OR custom condition).

### 2.2 No `validateUIMessages()` Before Model Calls

**File:** `packages/ai/src/stream.ts`

The crash course and docs recommend validating incoming UI messages against your tool definitions before sending to the model. This prevents tool-call injection attacks where a malicious client sends fabricated tool results.

```typescript
import { validateUIMessages } from 'ai';

// Before converting
const validatedMessages = await validateUIMessages(req.messages, {
  tools: createQAToolSet({ assetId: req.assetId, collectionId: req.collectionId }),
});
const modelMessages = await convertToModelMessages(validatedMessages);
```

### 2.3 Tool Output Type Safety on Frontend

**File:** `apps/web/src/components/chat/message.tsx:44-49`

Inline type assertion is fragile:

```typescript
// Current — unsafe cast
(part.output as {
  status: string;
  message: string;
  segments?: [];
  query?: string;
})
```

The `RetrieveResult` and `ContextResult` types already exist in `@milkpod/ai`. Use `InferUITools` from the SDK to get proper tool output types, or at minimum import and use the existing types:

```typescript
import type { RetrieveResult, ContextResult } from '@milkpod/ai';

// Then use a type guard or assertion with the actual types
```

### 2.4 Error Classes Defined but Never Used

**Files:** `packages/ai/src/errors.ts`, `packages/ai/src/stream.ts`

`AIError`, `EmbeddingError`, `RetrievalError`, `StreamingError` are exported but never thrown. The stream just does `console.error`. Either:
- Wire them into actual error paths (embeddings, retrieval, streaming)
- Remove them to avoid dead code

### 2.5 No `onError` in `createUIMessageStream` Pattern

**File:** `packages/ai/src/stream.ts:39-40`

Current error handling returns a string but doesn't distinguish error types:

```typescript
onError: (error) =>
  error instanceof Error ? error.message : 'An error occurred.',
```

The crash course demonstrates using `RetryError.isInstance()` and returning user-friendly messages based on error type. This would be a good place to use those custom error classes.

---

## 3. Missing Patterns to Adopt

### 3.1 Input Guardrails (High Priority)

The crash course has a dedicated exercise (09.01) for pre-checking user input with a cheap/fast model before invoking the expensive one.

**Pattern:**
```typescript
// Use fast model to check if request is allowed
const guardrailResult = await generateText({
  model: openai('gpt-4o-mini'), // or any cheap model
  system: GUARDRAIL_SYSTEM_PROMPT,
  messages: modelMessages,
});

if (guardrailResult.text.trim() === '0') {
  // Reject — stream a polite refusal
  return;
}

// Proceed with expensive model
```

For Milkpod, this could gate:
- Off-topic questions (not about the video/audio)
- Prompt injection attempts
- Requests that would waste expensive GPT-4o calls

### 3.2 Model Routing (Medium Priority)

The crash course exercise 09.02 shows routing between cheap and expensive models based on query complexity.

```typescript
const ADVANCED_MODEL = openai('gpt-4o');
const BASIC_MODEL = openai('gpt-4o-mini');

// Use cheap model to classify query complexity
const routerResult = await generateText({
  model: BASIC_MODEL,
  system: 'If trivial question return 0, if needs reasoning return 1',
  messages: modelMessages,
});

const model = routerResult.text.trim() === '1' ? ADVANCED_MODEL : BASIC_MODEL;
```

Right now Milkpod always uses GPT-4o for everything. Simple questions like "what is this video about?" don't need it.

### 3.3 `createUIMessageStream` for Custom Workflows (Medium Priority)

**Current:** Milkpod uses `streamText().toUIMessageStreamResponse()` — fine for simple cases.

**Better for complex flows:** The crash course shows `createUIMessageStream()` with a `writer` for full control:

```typescript
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';

const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    // Step 1: guardrail check
    // Step 2: stream text
    writer.merge(streamTextResult.toUIMessageStream());
    // Step 3: generate follow-up suggestions
    // Step 4: send custom data parts
  },
  onError(error) {
    return 'A user-friendly error message';
  },
});

return createUIMessageStreamResponse({ stream });
```

This is the pattern to adopt when adding guardrails, model routing, or multi-stage workflows. The current `toUIMessageStreamResponse()` shortcut won't support these.

### 3.4 Custom Data Parts for Status Updates (Medium Priority)

**File:** `packages/ai/src/types.ts`

`ChatDataParts` is defined but never used:

```typescript
export type ChatDataParts = {
  status: {
    threadId: string;
    status: 'processing' | 'completed';
    usage?: unknown;
  };
};
```

The crash course shows streaming custom data using `writer.write()`:

```typescript
writer.write({
  type: 'data-status',
  data: { threadId, status: 'processing' },
  id: crypto.randomUUID(),
});
```

This would be useful for:
- Sending the threadId as a data part instead of a response header (more reliable)
- Streaming processing status (embedding, searching, generating)
- Sending usage/cost metadata

### 3.5 Telemetry / Observability (Low Priority for Now)

The crash course exercise 06.07 shows Langfuse + OpenTelemetry integration:

```typescript
const result = streamText({
  model,
  messages,
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'chat',
    metadata: { langfuseTraceId: trace.id },
  },
});
```

Not urgent, but worth adding before production. Tracks:
- Token usage per request
- Latency per model call
- Tool call success/failure rates
- Cost attribution

### 3.6 Evals Framework (Low Priority for Now)

The crash course uses `evalite` for automated evaluation:

```typescript
evalite('QA Quality', {
  data: () => testCases,
  task: async (input) => { /* run through your pipeline */ },
  scorers: [{ name: 'relevance', scorer: ({ output, expected }) => score }],
});
```

Valuable for:
- Testing retrieval quality (does the right segment come back?)
- Testing citation format compliance
- Regression testing after model/prompt changes

### 3.7 `@ai-sdk/devtools` (Low Priority)

New in v6 — development-time inspection of AI SDK calls:

```typescript
import { devtools } from '@ai-sdk/devtools';

// Add to your dev server setup
```

---

## 4. Things NOT to Do

### 4.1 Don't Normalize Message Parts into Separate DB Rows
The current JSONB storage of `parts` in `qa_messages` is fine and matches what the crash course does. Normalizing into a separate `message_parts` table adds complexity without clear benefit at this stage.

### 4.2 Don't Over-Abstract the Streaming Layer
The current `createChatStream()` → `Response` pattern is clean. Don't add unnecessary abstraction layers until you actually have multiple AI endpoints with different behaviors.

### 4.3 Don't Add `temperature: 0` for Tool Calls
The docs recommend `temperature: 0` for deterministic tool calling, but for a QA system with natural language responses, some temperature is fine. The tool *selection* and *input generation* benefit from slight variance.

### 4.4 Don't Use `ToolLoopAgent` Yet
The crash course mentions it but it's not mature enough in v6. The current `streamText + tools + stopWhen` pattern is the right approach.

---

## 5. Migration Checklist

### Immediate (Before Next Feature)
- [ ] Upgrade `ai` to `^6.0.0`, `@ai-sdk/openai` to `^3.0.0`, `@ai-sdk/react` to `^3.0.0`
- [ ] Change `stopWhen: stepCountIs(5)` → `stopWhen: [stepCountIs(5)]`
- [ ] Add `validateUIMessages()` call before `convertToModelMessages()`
- [ ] Fix tool output type safety on frontend (use imported types)

### Short-term (Next Sprint)
- [ ] Add input guardrails with cheap model pre-check
- [ ] Switch to `createUIMessageStream()` pattern for extensibility
- [ ] Wire custom error classes into actual error paths or remove dead code
- [ ] Implement `ChatDataParts` for streaming status updates
- [ ] Add model routing for simple vs. complex queries

### Medium-term (Before Production)
- [ ] Add `experimental_telemetry` to `streamText` and `embed` calls
- [ ] Set up Langfuse or equivalent for observability
- [ ] Build eval suite for retrieval quality and response accuracy
- [ ] Add `@ai-sdk/devtools` to dev environment

---

## 6. Reference: v5 → v6 API Changes

| v5 (current) | v6 (target) | Notes |
|--------------|-------------|-------|
| `stopWhen: stepCountIs(n)` | `stopWhen: [stepCountIs(n)]` | Array of conditions |
| `convertToModelMessages()` | Same (already async) | No change needed |
| `import { createMCPClient } from 'ai'` | `import { createMCPClient } from '@ai-sdk/mcp'` | If/when MCP is added |
| `ai@5.0.129` | `ai@^6.0.0` | Major version bump |
| `@ai-sdk/openai@2.x` | `@ai-sdk/openai@3.x` | Major version bump |
| `@ai-sdk/react@2.x` | `@ai-sdk/react@3.x` | Major version bump |
| N/A | `@ai-sdk/devtools@0.0.x` | New package |
| N/A | `validateUIMessages()` | New security function |
| N/A | `createUIMessageStream()` | Preferred for complex flows |
