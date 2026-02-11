# AI SDK Audit — Milkpod vs. Crash Course Best Practices

Based on the `tutorials/ai-sdk-v5-crash-course` reference material (which covers v6 patterns) and the current state of `packages/ai/`, `packages/api/src/modules/chat/`, and `apps/web/src/components/chat/`.

---

## CRITICAL — Fix Now

### 1. `convertToModelMessages()` is async in v6

**File:** `packages/ai/src/stream.ts:18`

The call is currently synchronous:
```ts
messages: convertToModelMessages(req.messages),
```

In v6, this became `async`. This will silently break when upgrading — you'll pass a Promise instead of actual messages. Fix:
```ts
const modelMessages = await convertToModelMessages(req.messages);
const result = streamText({ ..., messages: modelMessages });
```

This means `createChatStream` must become `async` and return `Promise<Response>`.

### 2. `assetId` / `collectionId` are received but never used

**File:** `packages/ai/src/stream.ts`

`req.assetId` and `req.collectionId` are accepted in the `ChatRequest` interface but are never passed through. The LLM's `retrieve_segments` tool accepts an optional `assetId` input, but the model has no way of knowing *which* asset the user is viewing unless you tell it.

**Fix:** Inject context into the system prompt dynamically:
```ts
system: `${QA_SYSTEM_PROMPT}\n\n## Current Context\n- Asset ID: ${req.assetId ?? 'none (search all)'}\n- Collection: ${req.collectionId ?? 'none'}`,
```

Or better — scope tool calls directly by binding `assetId` into the tool's execute closure (see "Context injection via tool factories" below).

### 3. No message persistence

The tutorial dedicates an entire module to persistence and is emphatic: **don't store message parts as JSON blobs**. Milkpod currently has zero persistence — chat history is lost on page refresh.

**What the tutorial recommends:**
- Use `toUIMessageStreamResponse({ originalMessages, onFinish })` to get the full message array after streaming completes
- Normalize into a `messages` + `message_parts` table (not a JSON column)
- Store tool call inputs/outputs as separate part rows with a `type` discriminator

**Priority:** This blocks any real usage. Design the schema early to avoid migration pain later.

---

## HIGH — Address Before Shipping

### 4. No guardrails / input validation

The tutorial's advanced patterns module shows a fast pre-check with a cheap model before the main generation:
```ts
const guard = await generateText({
  model: cheapModel,
  messages: modelMessages,
  system: 'Return 0 if inappropriate, 1 if ok.',
});
if (guard.text.trim() === '0') { /* reject early */ }
```

Milkpod sends everything straight to GPT-4o with no filtering. For a user-facing product, add a guardrail before `streamText`.

### 5. No authorization on resource access

**File:** `packages/api/src/modules/chat/index.ts:16`

The endpoint checks `if (!session)` but never validates that the user owns the `threadId`, `assetId`, or `collectionId` they're querying. A logged-in user could pass any asset ID and retrieve segments from another user's transcripts.

### 6. Tool output type safety on the frontend

**File:** `apps/web/src/components/chat/message.tsx:44`

Tool output is cast with an inline type assertion:
```ts
part.output as { status: string; message: string; segments?: []; query?: string; }
```

This is fragile. If the tool output shape changes, there's no compile-time error. Define shared output types in `@milkpod/ai/types` and import them on both sides. The tutorial also suggests using `InferAgentUIMessage<typeof agent>` for full end-to-end type safety once you adopt `ToolLoopAgent`.

### 7. `sendReasoning: true` but no frontend rendering

**File:** `packages/ai/src/stream.ts:27`

Reasoning tokens are sent to the client but `message.tsx` has no handler for `part.type === 'reasoning'`. These parts are silently dropped. Either render them (collapsible "thinking" section) or stop sending them to save bandwidth.

### 8. Message body validation is `t.Any()`

**File:** `packages/api/src/modules/chat/model.ts:5`

```ts
messages: t.Array(t.Any()),
```

No validation on the messages array structure. A malformed payload will blow up deep in `convertToModelMessages`. At minimum, validate the shape matches `UIMessage[]`.

---

## MEDIUM — Plan For

### 9. Consider `ToolLoopAgent` (v6 pattern)

The tutorial introduces `ToolLoopAgent` as a cleaner alternative to `streamText + tools`:

```ts
const agent = new ToolLoopAgent({
  model: chatModel,
  instructions: QA_SYSTEM_PROMPT,
  tools: qaToolSet,
});

// In endpoint:
return createAgentUIStreamResponse({ agent, uiMessages: messages });
```

Benefits over current approach:
- Default 20 steps (vs manual `stepCountIs(5)`)
- `InferAgentUIMessage<typeof agent>` for end-to-end type inference
- Cleaner separation of agent config vs invocation
- `agent.generate()` for non-streaming use cases (evals, testing)

Not urgent, but worth adopting when upgrading to v6.

### 10. Context injection via tool factories

Instead of a static `qaToolSet`, create tool factories that close over the request context:

```ts
export function createQAToolSet(context: { assetId?: string; userId: string }) {
  return {
    retrieve_segments: tool({
      // ...same schema but assetId is now injected, not LLM-chosen
      execute: async function* ({ query }) {
        const segments = await findRelevantSegments(query, {
          assetId: context.assetId, // scoped automatically
          limit: 8,
        });
        yield { status: 'found', query, segments, message: '...' };
      },
    }),
  };
}
```

This removes the burden from the LLM to "remember" the assetId and prevents cross-tenant data leakage.

### 11. No model routing

For simple questions ("what is this video about?"), GPT-4o is overkill. The tutorial demonstrates a model router pattern:
1. Classify query complexity with a cheap/fast model
2. Route to GPT-4o-mini for simple, GPT-4o for complex
3. Attach the model choice as message metadata

This directly impacts cost at scale.

### 12. Custom data parts defined but unused

**File:** `packages/ai/src/types.ts`

`ChatDataParts` defines a `status` data part type, but `createChatStream` never writes any data parts. The `messageMetadata` callback on `toUIMessageStream` is also unused.

Either use these (e.g., stream `{ type: 'data-status', data: { threadId, status: 'processing' } }` at stream start) or remove the dead types to avoid confusion.

### 13. Stream start/finish part management

Currently fine since `toUIMessageStreamResponse()` handles this automatically. But if you move to `createUIMessageStream` for multi-step workflows (guardrail → route → generate), remember:

```ts
// Only ONE start and ONE finish per message
writer.write({ type: 'start' });
writer.merge(guardStream.toUIMessageStream({ sendStart: false, sendFinish: false }));
writer.merge(mainStream.toUIMessageStream({ sendStart: false, sendFinish: true }));
```

Multiple start/finish events = duplicate messages in the frontend.

### 14. No evaluation framework

The tutorial provides an `evalite` setup for scoring AI outputs. For a transcript Q&A system, obvious eval dimensions:
- Does the answer cite actual transcript timestamps?
- Are the retrieved segments relevant to the query?
- Does it refuse when segments don't contain the answer?

Set up evals early — they compound in value and catch regressions.

---

## LOW — Nice to Have

### 15. Prompt engineering structure

The tutorial recommends a 4-part template: **Context → History → Ask → Output Format**. The current `QA_SYSTEM_PROMPT` covers context and rules well but doesn't specify output formatting. Adding formatting guidance (e.g., "use markdown headers for multi-part answers", "always start citations on a new line") improves consistency.

### 16. Token budget awareness

No token counting or context window management. For long transcripts with many segments, the context could exceed the model's window. Consider:
- Tracking approximate token count of retrieved segments
- Truncating or summarizing when approaching limits
- Using `js-tiktoken` for local token estimation

### 17. Error class usage

`packages/ai/src/errors.ts` defines `AIError`, `EmbeddingError`, `RetrievalError`, `StreamingError` — but `stream.ts` only does `console.error` in `onError`. The custom error classes aren't used for classification or retry logic yet.

### 18. Embedding model version tracking

Embeddings are hardcoded to `text-embedding-3-small` (1536 dims). If you ever change models, all existing vectors become incompatible. Consider storing the model name/version alongside embeddings in the DB for future-proofing.

---

## Summary Table

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 1 | `convertToModelMessages` not awaited | Critical | 5 min |
| 2 | `assetId`/`collectionId` unused | Critical | 30 min |
| 3 | No message persistence | Critical | 2-4 hrs |
| 4 | No guardrails | High | 1 hr |
| 5 | No resource authorization | High | 1 hr |
| 6 | Tool output type safety | High | 30 min |
| 7 | Reasoning tokens sent but not rendered | High | 15 min |
| 8 | Message body validation | High | 30 min |
| 9 | Adopt ToolLoopAgent | Medium | 1 hr |
| 10 | Tool factories for context injection | Medium | 1 hr |
| 11 | Model routing | Medium | 2 hrs |
| 12 | Unused data part types | Medium | 15 min |
| 13 | Stream start/finish awareness | Medium | — |
| 14 | Evaluation framework | Medium | 2-4 hrs |
| 15 | Prompt output formatting | Low | 15 min |
| 16 | Token budget management | Low | 1-2 hrs |
| 17 | Error class usage | Low | 30 min |
| 18 | Embedding model versioning | Low | 30 min |
