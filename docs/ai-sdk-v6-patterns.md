# AI SDK v6 Patterns Reference

Distilled from the AI SDK v5/v6 crash course tutorials. These are the actual API patterns to use with `ai@^6.0.0`, `@ai-sdk/openai@^3.0.0`, `@ai-sdk/google@^3.0.0`, `@ai-sdk/react@^3.0.0`.

**When in doubt, read the `.d.ts` in `node_modules/.pnpm/ai@*/node_modules/ai/dist/index.d.ts`.**

---

## 1. Core Functions

### generateText — One-shot text generation

```ts
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

const result = await generateText({
  model: google('gemini-2.5-flash'),
  prompt: 'What is the capital of France?',
  // OR: messages: modelMessages,
  // OR: system + messages
});

result.text;        // string
result.usage;       // { promptTokens, completionTokens, totalTokens, cachedInputTokens }
result.steps;       // array of step results
result.toolCalls;   // tool calls from the last step
result.toolResults; // tool results from the last step
```

### streamText — Streaming text generation

```ts
import { streamText, convertToModelMessages, type UIMessage } from 'ai';

const result = streamText({
  model: google('gemini-2.5-flash'),
  messages: await convertToModelMessages(messages),
  system: 'You are a helpful assistant.',
  // OR for one-shot (no chat history):
  // prompt: 'Generate a title for this conversation: ...',
});

// Simple: return as UI message stream response
return result.toUIMessageStreamResponse();

// Access streams:
result.textStream;      // AsyncIterable<string>
result.text;            // Promise<string> (full text after completion)
result.usage;           // Promise<LanguageModelUsage> (resolves after stream ends)
result.consumeStream(); // consume without reading (await to wait for finish)

// IMPORTANT: onFinish only fires if the stream is consumed (via textStream iteration,
// consumeStream(), or toUIMessageStreamResponse). Unconsumed streams silently skip onFinish.

// Top-level consumeStream — works with any ReadableStream:
import { consumeStream } from 'ai';
await consumeStream({ stream: result.toUIMessageStream() });

// maxRetries (default 3) — set to 0 to disable automatic retries:
streamText({ model, messages, maxRetries: 0 });

// OpenTelemetry integration (e.g. Langfuse, Braintrust):
streamText({
  model, messages,
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'chat',         // labels the span in the trace
    metadata: { traceId: '...' }, // custom metadata forwarded to exporter
  },
});
```

### streamObject — Streaming structured output

```ts
import { streamObject } from 'ai';
import { z } from 'zod';

const result = streamObject({
  model: google('gemini-2.5-flash'),
  schema: z.object({
    plan: z.string(),
    queries: z.array(z.string()),
  }),
  messages: modelMessages,
});

// Partial objects as they stream in:
for await (const partial of result.partialObjectStream) {
  partial.plan;    // string | undefined (may be partial)
  partial.queries; // string[] | undefined (may be partial)
}

// Final validated object:
const final = await result.object; // { plan: string; queries: string[] }
```

---

## 2. Tool Calling (v6 API)

**CRITICAL: `inputSchema` not `parameters`.** This changed in v6.

```ts
import { tool } from 'ai';
import { z } from 'zod';

const myTool = tool({
  description: 'Search the knowledge base for relevant information',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    limit: z.number().optional().describe('Max results to return'),
  }),
  execute: async ({ query, limit }) => {
    // Tool implementation
    return { results: [...] };
  },
});

// Use in streamText:
streamText({
  model: google('gemini-2.5-flash'),
  tools: { search: myTool, readFile: readFileTool },
  stopWhen: [stepCountIs(10)], // Max 10 tool-use steps
  messages: modelMessages,
});
```

### Tool approval — needsApproval

```ts
const sendEmail = tool({
  description: 'Send an email',
  inputSchema: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
  needsApproval: true, // Pauses before execute, waits for client approval
  execute: async ({ to, subject, body }) => {
    return { sent: true, to, subject };
  },
});
```

See [Section 5](#tool-approval-on-the-client) for the client-side approval flow.

### Type-safe tool parts with InferUITools

```ts
import { type InferUITools, type UIMessage } from 'ai';

const tools = { writeFile: tool({ ... }), readFile: tool({ ... }) };

// Third generic param: typed tool parts (tool-writeFile, tool-readFile)
type MyUIMessage = UIMessage<never, never, InferUITools<typeof tools>>;
// part.type → 'tool-writeFile' | 'tool-readFile' | 'text' | ...
// part.input → typed per tool (e.g. { path: string; content: string })
// part.state → 'approval-requested' | 'output-available' | 'partial-call' | ...
```

### MCP Client Integration

```ts
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

// Stdio transport (e.g. Docker container):
import { Experimental_StdioMCPTransport as StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';

const mcpClient = await createMCPClient({
  transport: new StdioMCPTransport({
    command: 'docker',
    args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN! },
  }),
});

// HTTP transport:
const mcpClient = await createMCPClient({
  transport: { type: 'http', url: 'https://api.githubcopilot.com/mcp', headers: { Authorization: `Bearer ${token}` } },
});

// Use MCP tools in streamText — same as local tools:
const result = streamText({
  model, messages: modelMessages,
  tools: await mcpClient.tools(), // returns Record<string, Tool>
  stopWhen: [stepCountIs(10)],
});

// IMPORTANT: close client after stream finishes
return result.toUIMessageStreamResponse({
  onFinish: async () => { await mcpClient.close(); },
});
```

### ToolLoopAgent — Higher-level agent class

```ts
import { ToolLoopAgent, createAgentUIStreamResponse, type InferAgentUIMessage } from 'ai';

const agent = new ToolLoopAgent({
  model: google('gemini-2.5-flash'),
  instructions: 'You are a helpful file system assistant.', // system prompt
  tools,
});

type MyAgentUIMessage = InferAgentUIMessage<typeof agent>;

export const POST = async (req: Request) => {
  const { messages }: { messages: MyAgentUIMessage[] } = await req.json();
  return createAgentUIStreamResponse({ agent, uiMessages: messages });
};
```

### Multi-step agents with stopWhen

**CRITICAL: `stopWhen: [stepCountIs(n)]` not `maxSteps`.** This changed in v6.

```ts
import { stepCountIs } from 'ai';

streamText({
  model,
  tools: { ... },
  stopWhen: [stepCountIs(10)], // Stop after 10 steps max
  messages,
});
```

---

## 3. UIMessage Streams (Custom Data Parts)

The v6 streaming architecture is built around `UIMessage` and `UIMessageStream`.

### Simple: toUIMessageStreamResponse

```ts
const result = streamText({ model, messages });
return result.toUIMessageStreamResponse();
```

### With metadata on messages

```ts
type MyMessage = UIMessage<{
  duration: number;  // metadata attached to message
}>;

return result.toUIMessageStreamResponse<MyMessage>({
  messageMetadata({ part }) {
    if (part.type === 'finish') {
      return { duration: Date.now() - startTime };
    }
    return undefined;
  },
});

// OR on toUIMessageStream directly (e.g. when consuming manually or merging):
const stream = result.toUIMessageStream<MyMessage>({
  messageMetadata({ part }) {
    // Can react to any part type — not just 'finish':
    if (part.type === 'text-delta') { /* accumulate stats */ }
    if (part.type === 'finish') return { duration: Date.now() - startTime };
  },
  onFinish({ responseMessage }) {
    responseMessage.metadata; // MyMetadata — typed from the generic
  },
});
```

### Custom stream control: createUIMessageStream

When you need to orchestrate multiple LLM calls, stream custom data parts, or implement workflows:

```ts
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageStreamWriter,
} from 'ai';

type MyMessage = UIMessage<
  unknown,
  {
    suggestions: string[];  // custom data part types
    plan: string;
  }
>;

const stream = createUIMessageStream<MyMessage>({
  execute: async ({ writer }) => {
    // 1. Stream primary response
    const mainResult = streamText({ model, messages });
    writer.merge(mainResult.toUIMessageStream());
    await mainResult.consumeStream();

    // 2. Then stream follow-up structured data
    const suggestionsResult = streamObject({
      model,
      schema: z.object({ suggestions: z.array(z.string()) }),
      messages: [...],
    });

    const dataPartId = crypto.randomUUID();
    for await (const chunk of suggestionsResult.partialObjectStream) {
      writer.write({
        id: dataPartId,
        type: 'data-suggestions',
        data: chunk.suggestions?.filter(Boolean) ?? [],
      });
    }
  },
  onError(error) {
    // Return user-facing error message
    if (RetryError.isInstance(error)) {
      return 'Could not complete request. Please try again.';
    }
    return 'An unknown error occurred';
  },
});

return createUIMessageStreamResponse({ stream });
```

### Writer API

```ts
// Merge another stream (e.g. streamText result):
writer.merge(result.toUIMessageStream());
writer.merge(result.toUIMessageStream({ sendStart: false })); // skip start event
writer.merge(result.toUIMessageStream({ sendStart: false, sendFinish: false })); // skip both

// Write custom data parts (same ID → updates the part; new ID → creates a new part):
const dataPartId = crypto.randomUUID();
for await (const chunk of someResult.partialObjectStream) {
  writer.write({
    type: 'data-myCustomType',
    data: chunk.values?.filter(Boolean) ?? [],
    id: dataPartId, // reuse ID to stream updates to the same part
  });
}

// Write text manually:
const textPartId = crypto.randomUUID();
writer.write({ type: 'text-start', id: textPartId });
writer.write({ type: 'text-delta', delta: 'Hello!', id: textPartId });
writer.write({ type: 'text-end', id: textPartId });

// Signal start of message — REQUIRED when writing custom data parts
// before any writer.merge() call. merge() sends start automatically,
// but raw writer.write() does not:
writer.write({ type: 'start' });

// CRITICAL: Exactly ONE start and ONE finish per stream.
// Multiple start/finish events cause duplicate messages on the frontend.
// When merging multiple streamText results sequentially:
writer.write({ type: 'start' }); // manual start
writer.merge(first.toUIMessageStream({ sendStart: false, sendFinish: false }));
await first.consumeStream();
writer.merge(middle.toUIMessageStream({ sendStart: false, sendFinish: false }));
await middle.consumeStream();
writer.merge(last.toUIMessageStream({ sendStart: false })); // last one sends finish
```

---

## 4. Persistence

### Two onFinish callbacks — know the difference

```ts
const result = streamText({
  model, messages: modelMessages,
  onFinish: ({ response }) => {
    response.messages; // ModelMessage[] (AssistantModelMessage | ToolModelMessage)
    // ❌ NOT suitable for UI persistence — no UIMessage structure
  },
});

return result.toUIMessageStreamResponse({
  originalMessages: messages, // pass incoming UIMessages to get full history in onFinish
  onFinish: async ({ responseMessage, messages }) => {
    responseMessage; // UIMessage — the newly generated assistant message
    messages;        // UIMessage[] — full history (original + new) when originalMessages is set

    // ✅ Use responseMessage for append-only persistence:
    await appendToChatMessages(chatId, [responseMessage]);
  },
});
```

### Append-only persistence flow

```ts
// POST — receive user message, stream assistant response, save both
export const POST = async (req: Request) => {
  const { messages, id }: { messages: UIMessage[]; id: string } = await req.json();

  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.role !== 'user') {
    return new Response('Last message must be from user', { status: 400 });
  }

  const chat = await getChat(id);
  if (!chat) {
    await createChat(id, messages);              // first message — save all
  } else {
    await appendToChatMessages(id, [lastMessage]); // append user message only
  }

  const result = streamText({ model, messages: await convertToModelMessages(messages) });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ responseMessage }) => {
      await appendToChatMessages(id, [responseMessage]); // append assistant message
    },
  });
};

// GET — load chat history for hydration
export const GET = async (req: Request) => {
  const chatId = new URL(req.url).searchParams.get('chatId');
  if (!chatId) return new Response('Missing chatId', { status: 400 });
  return Response.json(await getChat(chatId));
};
```

### Validating incoming messages

```ts
import { validateUIMessages } from 'ai';

let messages: UIMessage[];
try {
  messages = await validateUIMessages({ messages: body.messages });
} catch {
  return new Response('Invalid messages', { status: 400 });
}
// Much simpler than writing a custom Zod schema for the full UIMessage shape
```

---

## 5. Client-Side: useChat

```ts
import { useChat } from '@ai-sdk/react';

type MyMessage = UIMessage<{ duration: number }, { suggestions: string[] }>;

const { messages, sendMessage, setMessages, status, error } = useChat<MyMessage>({
  id: chatId,              // ties hook to a specific chat — sent as body.id to API
  messages: savedMessages, // hydrate from DB on load (e.g. via react-query/SWR)
});

// Access custom data parts:
const latestSuggestion = messages[messages.length - 1]
  ?.parts.find((part) => part.type === 'data-suggestions')?.data;

// Access metadata:
const duration = messages[messages.length - 1]?.metadata?.duration;

// Message parts iteration (generic — no InferUITools):
messages.map((msg) => (
  msg.parts.map((part) => {
    if (part.type === 'text') return part.text;
    if (part.type === 'tool-invocation') return part.toolInvocation;
    if (part.type === 'data-suggestions') return part.data;
  })
));

// With InferUITools — typed tool parts (preferred):
// part.type is 'tool-writeFile' | 'tool-readFile' etc.
msg.parts.map((part) => {
  if (part.type === 'tool-writeFile') {
    part.input.path;    // string — typed from Zod schema
    part.input.content; // string
  }
});
```

### Tool approval on the client

```ts
import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';

const { messages, sendMessage, addToolApprovalResponse } = useChat<MyUIMessage>({
  // Auto-send when all pending approvals are handled:
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
});

// In message rendering — check tool part state:
if (part.type === 'tool-sendEmail' && part.state === 'approval-requested') {
  // Show approve/deny UI, then:
  addToolApprovalResponse({ id: part.approval.id, approved: true });
  // or: addToolApprovalResponse({ id: part.approval.id, approved: false });
}
if (part.type === 'tool-sendEmail' && part.state === 'output-available') {
  // Tool executed — show result
}
```

### sendMessage — Text vs Parts

```ts
// Simple text message:
sendMessage({ text: 'Hello' });

// With file/image attachments — use explicit parts:
import type { FileUIPart } from 'ai';

const filePart: FileUIPart = {
  type: 'file',
  url: await fileToDataURL(file), // base64 data URL
  mediaType: file.type,           // e.g. 'image/png'
};

sendMessage({
  parts: [
    { type: 'text', text: input },
    filePart,
  ],
});

// Helper:
const fileToDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
```

`convertToModelMessages` on the server handles file parts automatically — no extra server-side logic needed.

### setMessages — Programmatic message mutation

```ts
const { messages, sendMessage, setMessages } = useChat<MyMessage>({});

// Replace message history (e.g. after user selects a preferred model output):
const replaceMessage = (index: number, newParts: MyMessage['parts']) => {
  const newMessages = messages.slice(0, index);
  newMessages.push({ ...messages[index], parts: newParts });
  setMessages(newMessages);
};
```

**When to use**: A/B model comparison (replace multi-output message with chosen text), message editing/regeneration, branching conversations.

---

## 6. Advanced Patterns

### Guardrails — Pre-check before main generation

```ts
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    // Fast, cheap model for classification
    const guardrailResult = await generateText({
      model: google('gemini-2.5-flash-lite'),
      system: GUARDRAIL_SYSTEM_PROMPT,
      messages: modelMessages,
    });

    if (guardrailResult.text.trim() === '0') {
      // Blocked — write rejection text manually
      const id = crypto.randomUUID();
      writer.write({ type: 'text-start', id });
      writer.write({ type: 'text-delta', id, delta: 'Sorry, I cannot process that request.' });
      writer.write({ type: 'text-end', id });
      return;
    }

    // Passed — stream main response
    const result = streamText({ model: google('gemini-2.5-flash'), messages: modelMessages });
    writer.merge(result.toUIMessageStream());
  },
});
```

### Model Router — Pick model based on complexity

```ts
const stream = createUIMessageStream<MyMessage>({
  execute: async ({ writer }) => {
    // Use cheap model to decide
    const routerResult = await generateText({
      model: BASIC_MODEL,
      system: 'Return 0 for basic, 1 for advanced...',
      messages: modelMessages,
    });

    const model = routerResult.text.trim() === '1' ? ADVANCED_MODEL : BASIC_MODEL;

    const result = streamText({ model, messages: modelMessages });
    writer.merge(result.toUIMessageStream({
      messageMetadata: ({ part }) => {
        if (part.type === 'start') return { model: model === ADVANCED_MODEL ? 'advanced' : 'basic' };
      },
    }));
  },
});
```

### Parallel Model Comparison — A/B testing outputs

```ts
type MyMessage = UIMessage<never, { output: { model: string; text: string } }>;

const streamModelText = async (opts: {
  textStream: AsyncIterableStream<string>;
  model: string;
  writer: UIMessageStreamWriter<MyMessage>;
}) => {
  const partId = crypto.randomUUID();
  let fullText = '';
  for await (const text of opts.textStream) {
    fullText += text;
    opts.writer.write({
      type: 'data-output',
      data: { model: opts.model, text: fullText },
      id: partId, // same ID → updates the part in-place
    });
  }
};

const stream = createUIMessageStream<MyMessage>({
  execute: async ({ writer }) => {
    // Fire both models simultaneously — don't await individually
    const first = streamText({ model: MODEL_A, messages: modelMessages });
    const second = streamText({ model: MODEL_B, messages: modelMessages });

    // Stream both outputs concurrently as separate data parts
    await Promise.all([
      streamModelText({ textStream: first.textStream, model: 'Model A', writer }),
      streamModelText({ textStream: second.textStream, model: 'Model B', writer }),
    ]);
  },
});
```

Client-side: render both `data-output` parts side-by-side, then use `setMessages` to replace the comparison with the user's chosen text (see [setMessages](#setmessages--programmatic-message-mutation)).

### Iterative Refinement — Loop with early break

```ts
const stream = createUIMessageStream<MyMessage>({
  execute: async ({ writer }) => {
    writer.write({ type: 'start' }); // required — writing data parts before any merge

    let step = 0;
    let draft = '';
    let feedback = '';

    while (step < MAX_ITERATIONS) {
      // Generate draft
      const draftResult = streamText({ model, prompt: `...${draft}...${feedback}...` });
      const draftId = crypto.randomUUID();
      for await (const chunk of draftResult.textStream) {
        draft += chunk;
        writer.write({ type: 'data-draft', data: draft, id: draftId });
      }

      // Evaluate draft — streamObject for structured control flow + streaming
      const evalResult = streamObject({
        model,
        schema: z.object({
          feedback: z.string().optional(),
          isGoodEnough: z.boolean(),
        }),
        prompt: `Evaluate: ${draft}`,
      });

      // Stream partial feedback to user while waiting for the boolean
      const feedbackId = crypto.randomUUID();
      for await (const partial of evalResult.partialObjectStream) {
        if (partial.feedback) {
          writer.write({ type: 'data-feedback', data: partial.feedback, id: feedbackId });
        }
      }

      const evaluation = await evalResult.object;
      if (evaluation.isGoodEnough) break;
      feedback = evaluation.feedback ?? '';
      step++;
    }

    // Write final text
    const id = crypto.randomUUID();
    writer.write({ type: 'text-start', id });
    writer.write({ type: 'text-delta', delta: draft, id });
    writer.write({ type: 'text-end', id });
  },
});
```

### Research Workflow — Multi-step with external APIs

```ts
const stream = createUIMessageStream<MyMessage>({
  execute: async ({ writer }) => {
    // Step 1: Generate search queries (structured output)
    const queriesResult = streamObject({
      model, schema: z.object({ plan: z.string(), queries: z.array(z.string()) }),
      messages,
    });
    // Stream queries to frontend as they arrive
    for await (const partial of queriesResult.partialObjectStream) { ... }

    // Step 2: Execute search in parallel
    const searchResults = await Promise.all(
      (await queriesResult.object).queries.map(q => searchAPI(q))
    );

    // Step 3: Synthesize answer with search context
    const answerResult = streamText({
      model,
      system: `Answer using these sources: ${formatSources(searchResults)}`,
      messages,
    });
    writer.merge(answerResult.toUIMessageStream({ sendStart: false }));
  },
});
```

---

## 7. Error Handling

### Server — onError in createUIMessageStream

```ts
import { RetryError } from 'ai';

createUIMessageStream({
  execute: async ({ writer }) => { ... },
  onError(error) {
    // Return user-facing error string — becomes error.message on the client
    if (RetryError.isInstance(error)) {
      return 'Could not complete request. Please try again.';
    }
    return 'An unknown error occurred';
  },
});
```

### Client — error from useChat

The string returned by `onError` becomes `error.message` on the client:

```ts
const { messages, sendMessage, error } = useChat({});

// Render error state:
{error && <div className="text-red-400">{error.message}</div>}
```

---

## 8. Key Type Definitions

```ts
import type {
  UIMessage,          // Client-side message with parts
  ModelMessage,       // Server-side message for model
  UIMessagePart,      // Individual part within a UIMessage (text, tool-invocation, file, data-*)
  FileUIPart,         // File/image part: { type: 'file', url: string, mediaType: string }
  UIMessageStreamWriter, // Writer for custom stream control
  StepResult,         // Result from each tool-use step
  InferUITools,       // Infer typed tool parts from tools object → tool-{name} part types
  InferUITool,        // Infer a single tool's UI type
  InferAgentUIMessage, // Infer UIMessage type from a ToolLoopAgent instance
  InferToolInput,     // Extract input type from a tool: InferToolInput<typeof myTool>
  InferToolOutput,    // Extract output type from a tool: InferToolOutput<typeof myTool>
  AsyncIterableStream, // Typed async iterable (e.g. result.textStream: AsyncIterableStream<string>)
  UIDataTypes,        // Default data part types — use for generic component props: UIMessagePart<UIDataTypes, UITools>[]
  UITools,            // Default tool types — use for generic component props
} from 'ai';

import { validateUIMessages } from 'ai'; // Runtime validation for incoming UIMessage arrays
import { consumeStream } from 'ai';      // Top-level stream consumption: consumeStream({ stream })

// UIMessage is generic:
// UIMessage<TMetadata, TDataParts, TToolParts>
// TMetadata: type of message.metadata
// TDataParts: Record<string, DataPartType> for custom data parts
// TToolParts: InferUITools<typeof tools> for typed tool parts

type MyMessage = UIMessage<
  { duration: number },           // metadata
  { suggestions: string[] },      // custom data parts → data-suggestions
  InferUITools<typeof tools>      // typed tool parts → tool-writeFile, tool-readFile, etc.
>;
```

---

## Quick Reference: v6 Option Changes

| Old (v3/v4) | New (v6) | Where |
|---|---|---|
| `maxTokens` | `maxOutputTokens` | streamText, generateText |
| `maxSteps` | `stopWhen: [stepCountIs(n)]` | streamText, generateText |
| `parameters` | `inputSchema` | tool() |
| `onFinish({ text })` | `onFinish({ responseMessage })` | toUIMessageStreamResponse |
| `result.toAIStreamResponse()` | `result.toUIMessageStreamResponse()` | streamText |
| `useChat().handleSubmit` | `useChat().sendMessage` | @ai-sdk/react |
| Manual stream construction | `createUIMessageStream` + `writer` | Custom workflows |
| `experimental_output` | `Output.object()` / `Output.array()` | Structured output |

---

## Anti-Patterns to Catch in Review

| Anti-Pattern | Fix |
|---|---|
| `tool({ parameters: z.object(...) })` | `tool({ inputSchema: z.object(...) })` |
| `streamText({ maxSteps: 5 })` | `streamText({ stopWhen: [stepCountIs(5)] })` |
| `streamText({ maxTokens: 4096 })` | `streamText({ maxOutputTokens: 4096 })` |
| Manual JSON parsing of LLM text output | `streamObject` with `schema`, or `Output.object()` |
| Manual stream construction with ReadableStream | `createUIMessageStream` + `writer.merge()` |
| `console.error('AI error', err)` in stream | `onError(error) { return 'safe message'; }` |
| No timeout on generateText/streamText | Add `timeout: { totalMs: 60000 }` |
| No abort signal on long-running calls | Add `abortSignal: AbortSignal.timeout(ms)` |
| `result.toAIStreamResponse()` | `result.toUIMessageStreamResponse()` (v6) |
| Sending files as raw text/base64 in message content | `FileUIPart` with `sendMessage({ parts: [...] })` |
| `part.type === 'tool-invocation'` with manual tool name check | `InferUITools` for typed `tool-{name}` part types |
| Not closing MCP client after stream | `mcpClient.close()` in `onFinish` callback |
| Manual `streamText` + tool loop boilerplate | `ToolLoopAgent` + `createAgentUIStreamResponse` |
| Destructive tool executes without user consent | `needsApproval: true` + `addToolApprovalResponse` on client |
| Trusting unvalidated `body.messages` from client | `validateUIMessages({ messages: body.messages })` |
| Using `streamText.onFinish` for UI message persistence | Use `toUIMessageStreamResponse({ onFinish })` — gives `responseMessage` as UIMessage |
| Storing UIMessage parts as JSON blob in DB | Normalized parts table with mapping functions + CHECK constraints |
| No observability on LLM calls in production | `experimental_telemetry: { isEnabled: true, functionId }` + OpenTelemetry exporter |
| Not rendering `error` from `useChat()` | Render `error.message` — it's the string from server's `onError` |
| New `crypto.randomUUID()` per `writer.write` for streaming data | Reuse same `id` to update a data part in-place as chunks arrive |
| `writer.write()` data parts without preceding `{ type: 'start' }` | `writer.write({ type: 'start' })` before first write when not using `merge()` first |
| Using `generateText` for all intermediate workflow steps when user is waiting | `streamText` + `writer.write` custom data parts for visible intermediate progress |
| Sequential `await` on independent `streamText` calls for A/B comparison | Fire both, then `Promise.all` to stream concurrently as separate data parts |
| Multiple `start`/`finish` events in one stream (merging without `sendStart`/`sendFinish: false`) | Exactly one `start` + one `finish` per stream — suppress on inner merges |
| `streamText` with `onFinish` but stream never consumed | `onFinish` only fires after consumption — use `consumeStream()`, iterate `textStream`, or return `toUIMessageStreamResponse()` |
