# Pattern Distillation Plan

Go through each tutorial section, read every solution file, and distill the core patterns into the reference docs.

For AI SDK tasks → update `docs/ai-sdk-v6-patterns.md`
For TypeScript tasks → update `docs/typescript-patterns.md`

---

## Part A: AI SDK v6 Crash Course

Base path: `/Users/yash/Developer/tutorials/ai-sdk-v5-crash-course/exercises`

### ~~Task A1 - AI SDK Basics (01-ai-sdk-basics)~~ ✅

Exercises: 01.04-choosing-your-model, 01.05-generating-text, 01.06-stream-text-to-terminal, 01.07-ui-message-streams, 01.08-stream-text-to-ui, 01.10-passing-images-and-files

Focus: Provider setup, generateText vs streamText, UIMessage structure, convertToModelMessages, toUIMessageStream, passing files/images to models.

### ~~Task A2 - LLM Fundamentals (02-llm-fundamentals)~~ ✅

Exercises: 02.02-usage

Focus: Token counting, usage tracking, cost estimation, context window management.

### ~~Task A3 - Agents & Tool Calling (03-agents)~~ ✅

Exercises: 03.01-tool-calling, 03.03-showing-tools-in-the-frontend, 03.05-mcp-via-stdio, 03.07-tool-approval

Focus: tool() with inputSchema (Zod), stopWhen + stepCountIs, showing tool invocations in UI, MCP client integration, needsApproval pattern.

### ~~Task A4 - Persistence (04-persistence)~~ ✅

Exercises: 04.02-pass-chat-id-to-the-api, 04.03-persistence

Focus: onFinish callback with responseMessage, chat ID management, append-only message storage, GET endpoint for loading history.

### ~~Task A5 - Context Engineering (05-context-engineering)~~ ✅

Exercises: 05.02-basic-prompting, 05.03-exemplars, 05.04-retrieval, 05.05-chain-of-thought

Focus: Prompt structure (task-context, rules, output-format, the-ask), few-shot exemplars, retrieval augmentation, chain-of-thought with thinking blocks.

### ~~Task A6 - Evals (06-evals)~~ ✅

Exercises: 06.01-evalite-basics, 06.02-deterministic-eval, 06.03-llm-as-a-judge-eval, 06.05-chat-title-generation, 06.07-langfuse-basics

Focus: evalite framework, deterministic vs LLM-judge evaluation, dataset-driven testing, Langfuse observability integration.

### ~~Task A7 - Streaming Deep Dive (07-streaming)~~ ✅

Exercises: 07.01-custom-data-parts, 07.02-custom-data-parts-with-stream-object, 07.03-message-metadata, 07.04-error-handling

Focus: createUIMessageStream + writer, custom data part types (UIMessage generics), streamObject + partialObjectStream for structured streaming, messageMetadata callback, onError handler, RetryError.

### ~~Task A8 - Agents & Workflows (08-agents-and-workflows)~~ ✅

Exercises: 08.01-workflow, 08.02-streaming-custom-data-to-the-frontend, 08.03-creating-your-own-loop, 08.04-breaking-the-loop-early

Focus: Multi-step workflows with createUIMessageStream, streaming intermediate results as custom data, manual iteration loops, early termination via structured output evaluation (isGoodEnough).

### ~~Task A9 - Advanced Patterns (09-advanced-patterns)~~ ✅

Exercises: 09.01-guardrails, 09.02-model-router, 09.03-comparing-multiple-outputs, 09.04-research-workflow

Focus: Pre-flight guardrail classification, model routing based on complexity, parallel model comparison, multi-step research (query generation → web search → synthesis).

### ~~Task A10 - Reference Patterns (99-reference)~~ ✅

Read all explainer files in 99-reference to capture any additional patterns not covered in exercises.

---

## Part B: TypeScript Generics Workshop

Base path: `/Users/yash/Developer/tutorials/total-ts/typescript-generics-workshop/src`

### ~~Task B1 - Generics Intro (01-generics-intro)~~ ✅

Focus: Basic type parameters, generic return types, generic constraints with extends, multiple type params.

### ~~Task B2 - Passing Type Arguments (02-passing-type-arguments)~~ ✅

Focus: Explicit vs inferred type arguments, generic factories (createSet<T>), when to specify vs let TS infer.

### ~~Task B3 - Art of Type Arguments (03-art-of-type-arguments)~~ ✅

Focus: Literal type inference, const type parameter, array element generics, keyof constraints, partial inference workaround (curried generics).

### ~~Task B4 - Generics Advanced (04-generics-advanced)~~ ✅

Focus: Generic classes, reverse mapped types, const generic parameters, conditional rest parameters, generic inference from config objects.

### ~~Task B5 - Function Overloads (05-function-overloads)~~ ✅

Focus: Basic overloads, overloads with generics, conditional returns based on optional properties, privilege hierarchies, default overloads.

### ~~Task B6 - Generics Challenges (06-challenges)~~ ✅

Focus: Form validator factory, compose function, internationalization with template literals, infinite scroll typing.

---

## Part C: Advanced Patterns Workshop

Base path: `/Users/yash/Developer/tutorials/total-ts/advanced-patterns-workshop/src`

### ~~Task C1 - Branded Types (01-branded-types)~~ ✅

Focus: Brand<T, B> pattern, entity ID branding, Valid<T> brand for validation chains, multi-step brand transformation, index signatures with brands.

### ~~Task C2 - Globals (02-globals)~~ ✅

Focus: declare global, Window augmentation, process.env typing, declaration merging, extensible event dispatch via global interfaces.

### ~~Task C3 - Type Predicates & Assertion Functions (03-type-predicates-assertion-functions)~~ ✅

Focus: `is` type predicates, `asserts` functions, combining with brands, filter narrowing, class method type predicates (`this is`).

### ~~Task C4 - Classes (04-classes)~~ ✅

Focus: Generic classes with accumulating types (builder pattern), TypeSafeStringMap, DynamicMiddleware chaining.

### ~~Task C5 - External Libraries (05-external-libraries)~~ ✅

Focus: Extracting types from libs (Parameters, ReturnType, Awaited), wrapping untyped functions, Express handler typing, Zod integration.

### ~~Task C6 - Identity Functions (06-identity-functions)~~ ✅

Focus: `satisfies`, `as const`, const generic parameter, narrowing with constraints, config validation without widening.

### ~~Task C7 - Advanced Challenges (07-challenges)~~ ✅

Focus: DynamicReducer (discriminated union from mapped type), finite state machine with NoInfer, complex composition patterns.

---

## Part D: Type Transformations Workshop

Base path: `/Users/yash/Developer/tutorials/total-ts/type-transformations-workshop/src`

### ~~Task D1 - Inference Basics (01-inference-basics)~~ ✅

Focus: ReturnType, Parameters, Awaited, InstanceType, inferring from values.

### ~~Task D2 - Unions & Indexing (02-unions-and-indexing)~~ ✅

Focus: Discriminated unions, Extract, Exclude, keyof, indexed access types, union to object mapping.

### ~~Task D3 - Template Literals (03-template-literals)~~ ✅

Focus: Template literal types, string pattern matching, cartesian product unions, route validation.

### ~~Task D4 - Type Helpers Pattern (03.5-type-helpers-pattern)~~ ✅

Focus: Creating reusable type utilities, generic type helpers.

### ~~Task D5 - Conditional Types & Infer (04-conditional-types-and-infer)~~ ✅

Focus: Conditional types, infer keyword, extracting from Promise/generics, recursive conditional types.

### ~~Task D6 - Key Remapping (05-key-remapping)~~ ✅

Focus: Mapped types with `as` clause, filtering keys with never, Capitalize/Uncapitalize, computed property names.

### ~~Task D7 - Transformation Challenges (06-challenges)~~ ✅

Focus: Complex real-world type transformations combining multiple techniques.

---

## Part E: Pro Essentials Workshop (selected chapters)

Base path: `/Users/yash/Developer/tutorials/total-ts/pro-essentials-workshop/src`

### Task E1 - Unions, Narrowing & Objects (018-unions-and-narrowing, 020-objects)

Focus: Union narrowing patterns, discriminated unions, object type patterns, index signatures.

### Task E2 - Mutability & Assertions (028-mutability, 045-annotations-and-assertions)

Focus: as const, readonly, Object.freeze vs as const, type assertions, satisfies, const assertions in practice.

### Task E3 - Deriving Types & Designing Types (040-deriving-types-from-values, 083-designing-your-types)

Focus: typeof, keyof typeof, ReturnType, deriving from runtime values, designing composable type APIs.

### Task E4 - The Utils Folder (085-the-utils-folder)

Focus: Practical utility type patterns, Pick, Omit, Partial, Record, real-world type helpers.

---

## Part F: React + TypeScript Tutorial (selected chapters)

Base path: `/Users/yash/Developer/tutorials/total-ts/react-typescript-tutorial/src`

### Task F1 - Components & Hooks (02-components, 03-hooks)

Focus: Props typing, children, event handlers, useState with generics, useRef, useCallback typing.

### Task F2 - Advanced Props (04-advanced-props)

Focus: Discriminated union props, mutually exclusive props, polymorphic components.

### Task F3 - Generics & Advanced Hooks (05-generics, 06-advanced-hooks)

Focus: Generic components (Table<T>), generic hooks (useLocalStorage<T>), render props typing.

### Task F4 - Types Deep Dive & Advanced Patterns (07-types-deep-dive, 08-advanced-patterns)

Focus: ComponentProps, forwardRef typing, HOC typing, polymorphic as prop, DistributiveOmit.

### Task F5 - External Libraries (09-external-libraries)

Focus: React Hook Form typing, Lodash integration, third-party library type extraction.
