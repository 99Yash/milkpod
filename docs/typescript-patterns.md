# TypeScript Patterns Reference

Distilled from Total TypeScript workshops (generics, advanced patterns, pro essentials, type transformations, React+TS). These are the patterns to reach for when writing and reviewing code in this codebase.

## 1. Discriminated Unions & Exhaustive Switches

Use a literal `type` or `kind` field to discriminate. Always add a `never` default to catch new variants at compile time.

```ts
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string } };

function handle<T>(result: Result<T>) {
  switch (result.success) {
    case true:
      return result.data;
    case false:
      return result.error.message;
    default: {
      const _exhaustive: never = result;
      throw new Error(`Unhandled: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

**Where to use**: Asset status, message part types, pipeline stages, billing states, API error responses.

## 2. Type Guards & Assertion Functions

### Type predicate (`is`)

```ts
const isToolOutput = (part: unknown): part is ToolOutput =>
  typeof part === 'object' && part !== null && 'type' in part && part.type === 'tool-result';

// Use with .filter() to narrow arrays without casting:
const toolParts = parts.filter(isToolOutput); // ToolOutput[], not unknown[]
```

### Assertion function (`asserts`)

**CRITICAL: Must be a `function` declaration — arrow functions do NOT support `asserts` return types.** TS gives a cryptic error instead of a clear message.

```ts
// ✅ function declaration — works:
function assertIsAdmin(user: User): asserts user is User & { role: 'admin' } {
  if (user.role !== 'admin') throw new ForbiddenError('Admin required');
}

// ❌ arrow function — does NOT work:
// const assertIsAdmin = (user: User): asserts user is User & { role: 'admin' } => { ... }

// After call, TypeScript narrows the type:
assertIsAdmin(user);
user.role; // 'admin'
```

### Type predicate as generic callback parameter

A type predicate in a generic config interface flows the narrowed type into sibling callbacks:

```ts
interface ExtractorConfig<T, TResult> {
  isNode: (node: unknown) => node is T;  // predicate determines T
  transform: (node: T) => TResult;       // T flows here automatically
}

const createExtractor = <T, TResult>(config: ExtractorConfig<T, TResult>) =>
  (nodes: unknown[]): TResult[] =>
    nodes.filter(config.isNode).map(config.transform);

const extractDivs = createExtractor({
  isNode: isDivElement,                    // T inferred as HTMLDivElement
  transform: (div) => div.innerText,       // div is HTMLDivElement ✓
});
```

**Where to use**: Plugin systems with `isApplicable` + `handle` pairs, DOM node processors, message part renderers, any factory where a predicate determines the type for downstream callbacks.

### `is` predicate vs `asserts` for validation brands

Both combine with branded types (Section 3) but suit different control flows:

```ts
type Valid<T> = Brand<T, 'Valid'>;

// is — returns boolean, caller wraps in if/guard:
const isValidPassword = (values: PasswordValues): values is Valid<PasswordValues> =>
  values.password === values.confirmPassword;

if (isValidPassword(values)) { createUser(values); } // conditional path

// asserts — throws, linear flow (no wrapping):
function assertValidPassword(values: PasswordValues): asserts values is Valid<PasswordValues> {
  if (values.password !== values.confirmPassword) throw new Error('Mismatch');
}

assertValidPassword(values);
createUser(values); // linear — already narrowed
```

### Class method predicates — `this is` and `asserts this is`

Class methods can use type predicates and assertion functions to narrow `this` itself. This narrows optional/union properties on the instance after the call:

```ts
class Form<TValues> {
  error?: string;

  constructor(public values: TValues, private validate: (v: TValues) => string | void) {}

  // Type predicate on class method — narrows `this`:
  isInvalid(): this is this & { error: string } {
    const result = this.validate(this.values);
    if (typeof result === 'string') { this.error = result; return true; }
    this.error = undefined;
    return false;
  }
}

if (form.isInvalid()) {
  form.error; // string (narrowed from string | undefined)
}

// Assertion function on class method — narrows `this` linearly:
class SDK {
  loggedInUser?: User;

  assertIsLoggedIn(): asserts this is this & { loggedInUser: User } {
    if (!this.loggedInUser) throw new Error('Not logged in');
  }

  createPost(title: string) {
    this.loggedInUser; // User | undefined
    this.assertIsLoggedIn();
    this.loggedInUser; // User — narrowed by assertion
  }
}
```

**Where to use**: Form validation classes (`.isInvalid()` narrows error field), SDK/client classes with auth state (`.assertIsLoggedIn()` before protected operations), state machines where a method checks the current state.

**Where to use type guards generally**: Service methods that validate ownership/role before proceeding. Route handlers checking auth. Filtering arrays of mixed types (message parts, tool results). `is` when you need a boolean guard (if/else, `.filter()`); `asserts` when the function should throw on failure (linear validation chains, middleware). On class methods, use `this is` / `asserts this is` to narrow instance properties.

## 3. Branded Types

Prevent accidentally passing one string ID where another is expected.

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };

type UserId = Brand<string, 'UserId'>;
type AssetId = Brand<string, 'AssetId'>;
type ThreadId = Brand<string, 'ThreadId'>;

// Factory:
const createUserId = (id: string): UserId => id as UserId;

// Now these are compile-time errors:
declare function getAsset(id: AssetId): Promise<Asset>;
getAsset(userId); // Type error: UserId is not AssetId
```

### Validation brands

```ts
type Valid<T> = Brand<T, 'Valid'>;

function validateUrl(url: string): asserts url is Valid<string> {
  if (!URL.canParse(url)) throw new ValidationError('Invalid URL');
}

function ingest(url: Valid<string>) { /* only accepts validated URLs */ }
```

### Multi-step brand pipeline

Multiple branded types enforce operation ordering at compile time — each step produces a brand required by the next:

```ts
type ConvertedAmount = Brand<number, 'ConvertedAmount'>;
type AuthorizedUser = Brand<User, 'AuthorizedUser'>;

const convert = async (amount: number): Promise<ConvertedAmount> =>
  ((amount * 0.82) as ConvertedAmount);

const authorize = (user: User, amount: ConvertedAmount): AuthorizedUser => {
  if (user.maxAmount < amount) throw new Error('Unauthorized');
  return user as AuthorizedUser;
};

// Requires ALL branded inputs — compiler enforces step ordering:
const execute = (user: AuthorizedUser, amount: ConvertedAmount) => { /* ... */ };

const amount = await convert(rawAmount);  // must convert first
const authed = authorize(user, amount);   // needs ConvertedAmount from previous step
await execute(authed, amount);            // needs both brands ✓
```

**Where to use**: Payment/conversion pipelines, multi-step validation (sanitize → validate → persist), auth + business rule chains, any workflow where operations must happen in a specific order.

### Branded index signatures

Branded types as index signature keys create heterogeneous type-safe maps:

```ts
const db: { [id: PostId]: Post; [id: UserId]: User } = {};

db[postId] = { id: postId, title: 'Hello' };  // OK — Post for PostId
db[userId] = { id: userId, name: 'Miles' };    // OK — User for UserId
db[postId] = { id: userId, name: 'Miles' };    // error — User ≠ Post

const post = db[postId]; // Post (not Post | User)
```

**Where to use**: Entity IDs (UserId, AssetId, ThreadId, ShareLinkId), validated inputs (URLs, emails), pipeline stages where data must pass validation before proceeding. Branded index signatures for in-memory caches keyed by entity ID.

## 4. Generic Constraints

Make functions work with any type that has the shape you need, preserving the full type for the caller.

```ts
// Bad: loses extra properties
const enrichUser = (user: { firstName: string; lastName: string }) => ({
  ...user,
  fullName: `${user.firstName} ${user.lastName}`,
});

// Good: preserves the full type
const enrichUser = <T extends { firstName: string; lastName: string }>(user: T) => ({
  ...user,
  fullName: `${user.firstName} ${user.lastName}`,
});
// enrichUser({ firstName: 'a', lastName: 'b', role: 'admin' })
// returns { firstName, lastName, role, fullName } — role is preserved
```

**Where to use**: Service utility functions, middleware transforms, any function that adds/transforms properties while keeping the rest.

### Default type parameters & explicit type arguments

```ts
// Default type param — sensible fallback when caller omits the type:
const createSet = <T = string>() => new Set<T>();
createSet<number>(); // Set<number>
createSet();         // Set<string> (default), not Set<unknown>

// Explicit type arg on .reduce() — required when accumulator differs from element:
const byName = users.reduce<Record<string, User>>((acc, user) => {
  acc[user.name] = user;
  return acc;
}, {}); // without <Record<...>>, TS infers {} from the initial value

// Explicit type arg on fetch wrappers — no inference site for return type:
const fetchData = async <TData>(url: string): Promise<TData> =>
  fetch(url).then((r) => r.json());
const user = await fetchData<{ name: string }>('/api/user/1');

// Default type param as warning — forces a visible hint if caller forgets:
const fetchData2 = async <TResult = "You must pass a type argument to fetchData">(
  url: string,
): Promise<TResult> => fetch(url).then((r) => r.json());
await fetchData2('/api/user');                  // type: "You must pass a type argument..."
await fetchData2<{ name: string }>('/api/user'); // type: { name: string }
```

**When to pass explicit type args**: When there's no argument from which TS can infer the type (factory with no params, `.reduce()` with different accumulator type, fetch wrappers). If arguments provide enough info, let TS infer. Use a descriptive default string (not `unknown`) to signal when a type arg is mandatory.

### Literal inference with `extends string`

By default, TS widens `"INFO"` to `string` when the value flows into an object or array return. Adding `extends string` (or `extends number`) forces literal inference:

```ts
// Without constraint: TStatus = string (widened)
const makeStatus = <TStatus>(statuses: TStatus[]) => statuses;
makeStatus(["INFO", "DEBUG"]); // string[]

// With constraint: TStatus = "INFO" | "DEBUG" (literal union)
const makeStatus = <TStatus extends string>(statuses: TStatus[]) => statuses;
makeStatus(["INFO", "DEBUG"]); // ("INFO" | "DEBUG")[]

// Same for return values in objects:
const wrap = <T extends string>(t: T) => ({ output: t });
wrap("a"); // { output: "a" }, not { output: string }
```

**Rule of thumb**: If you need the generic to preserve literals, constrain it to a primitive (`extends string`, `extends number`, `extends string | number`). Without the constraint, wrapping the value in an object/array widens it.

### `extends {}` — non-nullish constraint

`{}` in TypeScript means "any non-nullish value" — `null` and `undefined` do NOT extend `{}`. Use this to exclude them from a generic:

```ts
type Maybe<T extends {}> = T | null | undefined;

Maybe<string>;    // string | null | undefined  ✓
Maybe<0>;         // 0 | null | undefined        ✓
Maybe<false>;     // false | null | undefined     ✓
Maybe<null>;      // error — null doesn't extend {}
Maybe<undefined>; // error — undefined doesn't extend {}
```

**Where to use**: Utility types or functions that should only accept "real" values — not `null`/`undefined`. `extends {}` is the cleanest way to say "non-nullish" without `extends NonNullable<unknown>`.

### Place generics at the level you care about

When extracting a nested type, put the generic on the specific field — not on the whole object:

```ts
// Verbose: generic on root, then index into it
const getFlags = <TConfig extends { raw: { flags: { home: any } } }>(
  config: TConfig,
  override: (f: TConfig["raw"]["flags"]["home"]) => TConfig["raw"]["flags"]["home"]
) => override(config.raw.flags.home);

// Better: generic directly on the nested type
const getFlags = <TFlags>(
  config: { raw: { flags: { home: TFlags } } },
  override: (f: TFlags) => TFlags
) => override(config.raw.flags.home);
```

**Where to use**: Functions that operate on a specific nested field of a larger config/state object.

### Curried generics for partial inference

TS cannot partially infer type arguments — you either specify all or none. Split into two function calls so the first captures one type and the second uses it:

```ts
// Outer captures variant keys from the config object;
// inner function constrains its argument to those keys:
const createClassNames =
  <TVariant extends string>(classes: Record<TVariant, string>) =>
  (variant: TVariant, ...extra: string[]) =>
    [classes[variant], ...extra].join(' ');

const bg = createClassNames({ primary: 'bg-blue-500', secondary: 'bg-gray-500' });
bg('primary');   // OK — TVariant inferred as 'primary' | 'secondary'
bg('tertiary');  // error: not assignable
```

**Where to use**: Factory functions, builder APIs, React Query's `useQuery`, any pattern where one call configures and a second call consumes.

### Conditional return types

Use a conditional type as the return to give callers a precise type based on input:

```ts
type GreetingResult<T> = T extends 'hello' ? 'goodbye' : 'hello';

const flip = <T extends 'hello' | 'goodbye'>(greeting: T): GreetingResult<T> =>
  (greeting === 'goodbye' ? 'hello' : 'goodbye') as GreetingResult<T>;

flip('hello');   // type: 'goodbye'
flip('goodbye'); // type: 'hello'
```

Note: TS cannot narrow conditional types inside implementations — `as` cast is required in the body. Extract the conditional into a named type helper for readability.

**Where to use**: Toggle functions, format converters that return different types per input variant, any function where the output type depends on a literal input.

### Correlated key-value with indexed access

Link a function's parameter types via indexed access `T[K]` so key and value stay in sync:

```ts
const setValue = <TObj, TKey extends keyof TObj>(
  obj: TObj, key: TKey, value: TObj[TKey],
): void => { obj[key] = value; };

setValue(user, 'age', 30);    // OK — TObj[TKey] = number
setValue(user, 'age', 'old'); // error — string not assignable to number
```

**Where to use**: Config setters, event emitters (`emit<K>(event: K, payload: Events[K])`), form field handlers, any function that needs type-safe key→value correspondence.

### Method-level generics on generic interfaces

A method on a generic interface can introduce its OWN type parameter, distinct from the interface's:

```ts
interface Cache<T> {
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => void;
  clone: <U>(transform: (elem: T) => U) => Cache<U>; // U is new — maps T → U
}
```

`T` is the container type (set at creation), `U` is the transformation target (inferred per call). This is how `Array<T>.map<U>()` and `Promise<T>.then<U>()` work.

**Where to use**: Collection/container types with transformation methods, middleware chains, any generic data structure that supports mapping to a different type.

### Generic function wrappers

Wrap an arbitrary function while preserving its parameter and return types:

```ts
const makeSafe =
  <TFunc extends (...args: any[]) => any>(func: TFunc) =>
  (...args: Parameters<TFunc>): { type: 'success'; result: ReturnType<TFunc> } | { type: 'failure'; error: Error } => {
    try { return { type: 'success', result: func(...args) }; }
    catch (e) { return { type: 'failure', error: e as Error }; }
  };

const safeParseInt = makeSafe(parseInt);
safeParseInt('42', 10); // { type: 'success', result: number } | { type: 'failure', error: Error }
```

**Where to use**: Error boundary wrappers, logging decorators, retry wrappers, any higher-order function that adds behavior around an existing function.

## 5. `satisfies` Keyword

Validate a value matches a type without widening it. Preserves literal types and autocomplete.

```ts
const PLAN_LIMITS = {
  free: { words: 5000, models: ['gpt-4o-mini'] as const },
  pro: { words: 50000, models: ['gpt-4o-mini', 'gpt-4o'] as const },
  team: { words: 200000, models: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'] as const },
} satisfies Record<string, { words: number; models: readonly string[] }>;

// PLAN_LIMITS.free.words is number (not widened)
// PLAN_LIMITS.pro.models is readonly ['gpt-4o-mini', 'gpt-4o'] (literal tuple)
// PLAN_LIMITS.unknown would error (validated against Record)
```

**Where to use**: Config objects (plan limits, model registry, tool definitions), route maps, enum-like constants. Use instead of `as const` when you also need shape validation.

## 6. `as const` for Literal Preservation

```ts
const MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
] as const;

type ModelId = (typeof MODELS)[number]['id']; // 'gpt-4o-mini' | 'gpt-4o'
```

### With generic functions (const type parameter)

```ts
const asConst = <const T>(t: T) => t;
// Preserves literal types when passing through functions
```

### `const` + constraint — literal preservation with shape validation

Combine `const` with `extends` to get both literal inference AND compile-time shape checking. This is the function-argument equivalent of `satisfies` + `as const`:

```ts
const narrowFruits = <const T extends readonly { name: string; price: number }[]>(t: T) => t;

const fruits = narrowFruits([
  { name: 'apple', price: 1 },
  { name: 'banana', price: 2 },
]);
// type: readonly [{ readonly name: "apple"; readonly price: 1 }, ...]

narrowFruits(["not a fruit"]); // error — doesn't match constraint
```

**Where to use**: Config factories, registry builders — any identity function where you want to validate shape AND preserve literal types. Without `const`, literals widen; without `extends`, invalid shapes pass silently.

**Where to use `as const` generally**: Model registries, plan catalogs, route definitions, any constant array/object where you need to extract literal union types.

## 7. Utility Type Patterns

### `NoInfer<T>` — prevent inference from a position

When a generic appears in multiple positions, TS infers from ALL of them. Use `NoInfer<T>` (built-in since TS 5.4) to mark a position as "check-only" — it must match but doesn't contribute to inference:

```ts
interface FSMConfig<TState extends string> {
  initial: NoInfer<TState>;  // checked against TState, but doesn't influence it
  states: Record<TState, { onEntry?: () => void }>;  // TState inferred from HERE
}

const makeFSM = <TState extends string>(config: FSMConfig<TState>) => config;

makeFSM({
  initial: 'a',        // OK — 'a' exists in states
  states: { a: {}, b: {} },
});

makeFSM({
  initial: 'c',        // error — 'c' not in states
  states: { a: {}, b: {} },
});
```

Without `NoInfer`, `initial: 'c'` would widen `TState` to `'a' | 'b' | 'c'`, silently allowing a non-existent state.

**Where to use**: Config objects where one field defines the valid set (states, routes, event names) and another field must reference only values from that set. FSMs, router configs, event dispatch tables.

### Identity functions for object generics

TS cannot put generics on raw object literals. When two properties of an object need to share an inferred generic (e.g. `routes` defines valid keys, `fetchers` is constrained to those keys), wrap in an identity function:

```ts
interface ConfigObj<TRoute extends string> {
  routes: TRoute[];
  fetchers: { [K in TRoute]?: () => any };
}

// Identity function — infers TRoute from routes, constrains fetchers:
const makeConfig = <TRoute extends string>(config: ConfigObj<TRoute>) => config;

makeConfig({
  routes: ['/', '/about'],
  fetchers: {
    '/': () => fetch('/'),
    '/nope': () => {},  // error — '/nope' not in routes
  },
});
```

**Where to use**: Any config object where one field's values should constrain another field's keys. Route-to-handler maps, event-to-listener registries, column-to-renderer configs.

### Derive types from values, not the other way around

```ts
// Extract return type from async function:
type User = Awaited<ReturnType<typeof getUser>>;

// Extract parameters for wrapping:
type FetchParams = Parameters<typeof fetchUser>;
const wrappedFetch = (...args: FetchParams) => fetchUser(...args);

// Partial for update payloads:
type UpdateAsset = Partial<Omit<Asset, 'id' | 'createdAt'>>;

// Record for config maps:
type RouteHandlers = Record<keyof typeof routes, RequestHandler>;
```

### Extract/Exclude from discriminated unions

```ts
type Event = { type: 'click'; x: number } | { type: 'focus' } | { type: 'keydown'; key: string };

type ClickEvent = Extract<Event, { type: 'click' }>; // { type: 'click'; x: number }
type NonKeyEvents = Exclude<Event, { type: 'keydown' }>; // click | focus
```

**Where to use**: API response types derived from service functions, update payloads derived from entity types, event filtering.

### Type-safe const array lookup with `Extract`

Combine `<const T>` with `Extract` to create a lookup function that returns the specific element type from a const array, not the base interface:

```ts
interface Fruit { name: string; price: number }

const wrapFruit = <const TFruits extends readonly Fruit[]>(fruits: TFruits) => ({
  getFruit: <TName extends TFruits[number]["name"]>(name: TName) =>
    fruits.find((f) => f.name === name) as Extract<TFruits[number], { name: TName }>,
});

const fruits = wrapFruit([
  { name: "apple", price: 1 },
  { name: "banana", price: 2 },
]);

fruits.getFruit("apple");       // { readonly name: "apple"; readonly price: 1 }
fruits.getFruit("not-allowed"); // error — not in array
```

Key pieces: `TFruits[number]["name"]` extracts the union of all `name` values from the const tuple. `Extract<TFruits[number], { name: TName }>` narrows back to the specific element.

**Where to use**: Model/provider registries (look up by ID, get specific config shape), plugin systems, any const data array where a lookup should return the precise element type rather than the base interface.

### `NonEmptyArray<T>` — enforce at least one element

```ts
type NonEmptyArray<T> = [T, ...T[]];

const makeEnum = (values: NonEmptyArray<string>) => { /* ... */ };

makeEnum(["a"]);            // OK
makeEnum(["a", "b", "c"]);  // OK
makeEnum([]);               // error — Source has 0 element(s) but target requires 1
```

**Where to use**: Functions that break on empty input (enum builders, `Promise.all` wrappers where at least one promise is expected, validation rule lists). Catches empty arrays at compile time instead of runtime.

## 7.5. Conditional Types & `infer`

### `infer` — extract parts of a type

Use `infer` inside a conditional type's `extends` clause to capture a sub-part of the matched type:

```ts
// From an object property:
type GetData<T> = T extends { data: infer D } ? D : never;
GetData<{ data: string }>  // string
GetData<number>            // never

// From a generic type parameter (use `any` for positions you don't care about):
type GetPoint<T> = T extends MyInterface<any, any, any, infer P> ? P : never;

// From a function return:
type GetReturn<T> = T extends (...args: any[]) => infer R ? R : never;

// Deep nesting — compose all of the above:
type InferProps<T> = T extends () => Promise<{ props: infer P }> ? P : never;
// The Next.js getServerSideProps inference pattern
```

### Union of patterns with same `infer` name

When multiple shapes should extract the same type, use a union of patterns with the same `infer` variable — TS unifies them into a single branch:

```ts
type GetResult<T> = T extends
  | { parse: () => infer R }
  | { extract: () => infer R }
  | (() => infer R)
  ? R
  : never;

GetResult<{ parse: () => number }>    // number
GetResult<() => string>               // string
GetResult<{ extract: () => boolean }> // boolean
```

Cleaner than chaining `T extends A ? ... : T extends B ? ... : T extends C ? ... : never`.

### Distributive conditional types

When a **generic type parameter** is checked with `extends`, TS distributes over union members — checking each separately:

```ts
// This is how Extract and Exclude work internally:
type MyExtract<T, U> = T extends U ? T : never;

type Fruit = "apple" | "banana" | "orange";
type Result = MyExtract<Fruit, "apple" | "banana">; // "apple" | "banana"
// TS checks each member: "apple" extends ...? → "apple" | "banana" extends ...? → "banana" | "orange" extends ...? → never
```

**Critical**: Distribution ONLY happens when `T` is a **generic type parameter**. A raw type does NOT distribute:

```ts
// ❌ Does NOT distribute — checks the whole union at once:
type Bad = Fruit extends "apple" | "banana" ? Fruit : never; // never (whole union fails)

// ✅ Fix 1: Wrap in a generic:
type GetApple<T> = T extends "apple" | "banana" ? T : never;
type Good = GetApple<Fruit>; // "apple" | "banana"

// ✅ Fix 2: `extends infer T` trick — forces distribution on a raw type:
type AlsoGood = Fruit extends infer T
  ? T extends "apple" | "banana" ? T : never
  : never; // "apple" | "banana"
```

**Where to use**: Building custom `Extract`/`Exclude` variants, filtering union types, type-level `Array.filter` equivalents. Understand distribution to debug unexpected `never` results from conditional types.

## 8. Mapped Types with Key Remapping

```ts
// Create getter map from attributes:
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

// Filter keys by pattern:
type IdKeys<T> = {
  [K in keyof T as K extends `${string}Id` ? K : never]: T[K];
};

// Convert union to discriminated union:
type ToDiscriminatedUnion<T extends Record<string, object>> = {
  [K in keyof T]: { type: K } & T[K];
}[keyof T];
```

### Iterate over union members with `as` remapping

The `in` clause can iterate over a **whole union of objects** (not just `keyof`). Use `as` to extract a key from each member — cleaner than `Extract` for discriminated union → object:

```ts
type Route =
  | { route: "/"; search: { page: string } }
  | { route: "/about"; search: {} };

// R is the full union member — as clause extracts the key:
type RoutesObject = { [R in Route as R["route"]]: R["search"] };
// { "/": { page: string }; "/about": {} }

// Compare to the verbose Extract approach (same result):
type RoutesObject2 = { [R in Route["route"]]: Extract<Route, { route: R }>["search"] };
```

When not all union members have the property, use `infer` on the value side to conditionally extract it:

```ts
type Route =
  | { route: "/"; search: { page: string } }
  | { route: "/about" }       // no search property
  | { route: "/admin" };

type RoutesObject = {
  [R in Route as R["route"]]: R extends { search: infer S } ? S : never;
};
// { "/": { page: string }; "/about": never; "/admin": never }
```

### Mapped type → union via `[keyof T]` indexing

A mapped type indexed by `[keyof T]` produces a union of per-key results. General-purpose object → union conversion:

```ts
interface Values { email: string; firstName: string; age: number }

// Object → union of tuples:
type Entries = { [K in keyof Values]: [K, Values[K]] }[keyof Values];
// ["email", string] | ["firstName", string] | ["age", number]

// Object → union of template literals:
type FruitMap = { apple: "red"; banana: "yellow" };
type FruitLabels = { [K in keyof FruitMap]: `${K}:${FruitMap[K]}` }[keyof FruitMap];
// "apple:red" | "banana:yellow"
```

**Where to use**: Event handler maps, API route type generation, converting config objects to union types, discriminated union ↔ object conversions, type-safe `Object.entries` equivalents.

### Reverse mapped types — per-key callback typing

When TS infers `T` from an object parameter with a mapped type, each key's callback gets its own literal key type via reverse inference:

```ts
function makeEventHandlers<T>(obj: { [K in keyof T]: (name: K) => void }) {
  return obj;
}

makeEventHandlers({
  click: (name) => { /* name is "click", not string */ },
  focus: (name) => { /* name is "focus" */ },
});
```

TS infers `T` from the object's keys, then for each key `K`, the callback parameter `name` has type `K` (the specific literal key), not `string | keyof T`.

**Where to use**: Event handler registries, form field handlers, plugin systems where each handler needs its own key type.

## 8.4. Template Literal Types

### Pattern types — validate string shape

Template literals with `string` create pattern types that constrain what strings are accepted:

```ts
type Route = `/${string}`;

const goToRoute = (route: Route) => {};
goToRoute("/users");    // OK
goToRoute("/admin/x");  // OK
goToRoute("users/1");   // error — doesn't start with /
```

### Extract/Exclude with template literal patterns

Filter a string union by matching against a template literal pattern:

```ts
type Routes = "/users" | "/users/:id" | "/posts" | "/posts/:id";

type DynamicRoutes = Extract<Routes, `${string}:${string}`>;
// "/users/:id" | "/posts/:id"

type StaticRoutes = Exclude<Routes, `${string}:${string}`>;
// "/users" | "/posts"
```

### Cartesian product — unions in template literals

Unions inside a template literal produce ALL combinations. Use with `Record` to generate typed object shapes:

```ts
type Entity = "user" | "post" | "comment";
type Suffix = "Id" | "Name";

type EntityKeys = `${Entity}${Suffix}`;
// "userId" | "userName" | "postId" | "postName" | "commentId" | "commentName"

type EntityMap = Record<EntityKeys, string>;
// { userId: string; userName: string; postId: string; postName: string; ... }
```

### Intrinsic string types

TS provides 4 built-in string transformation types that distribute over unions:

```ts
type E = "log_in" | "log_out";

Uppercase<E>     // "LOG_IN" | "LOG_OUT"
Lowercase<E>     // "log_in" | "log_out"
Capitalize<E>    // "Log_in" | "Log_out"
Uncapitalize<E>  // "log_in" | "log_out"

// Combine with Record to transform keys:
type Events = Record<Uppercase<E>, string>;
// { LOG_IN: string; LOG_OUT: string }
```

**Where to use**: Route validation (`/${string}`), API path constraints, filtering route unions for dynamic vs static segments, generating typed config objects from entity/suffix combinations, enum-like key transformations (snake_case → SCREAMING_SNAKE).

## 8.5. Template Literal Extraction with `infer`

Recursively extract parameter names from template literal strings at the type level:

```ts
type GetParamKeys<T extends string> = T extends ""
  ? []
  : T extends `${string}{${infer Param}}${infer Tail}`
  ? [Param, ...GetParamKeys<Tail>]
  : [];

type Keys = GetParamKeys<"Hello, {name}! You have {count} messages.">;
// type: ["name", "count"]

// Practical use: type-safe i18n with conditional rest params
const translate = <
  TTranslations extends Record<string, string>,
  TKey extends keyof TTranslations,
  TParams extends string[] = GetParamKeys<TTranslations[TKey]>,
>(
  translations: TTranslations,
  key: TKey,
  ...args: TParams extends [] ? [] : [params: Record<TParams[number], string>]
) => { /* replace {param} placeholders */ };

const t = { greeting: "Hi, {name}!", button: "Click me" } as const;
translate(t, "greeting", { name: "Yash" }); // params required
translate(t, "button");                      // no params allowed
```

**Where to use**: i18n/translation functions, route parameter extraction (`"/users/{id}/posts/{postId}"`), template DSLs. Combine with conditional rest parameters (Section 9) to enforce params only when placeholders exist.

## 8.6. Recursive Type Utilities

### `DeepPartial<T>` — make all nested properties optional

Recursive conditional type that applies `Partial` at every level. Must special-case arrays to avoid making array methods optional:

```ts
type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : { [K in keyof T]?: DeepPartial<T[K]> };

type Config = { db: { host: string; port: number; pool: { min: number; max: number } } };
type PartialConfig = DeepPartial<Config>;
// { db?: { host?: string; port?: number; pool?: { min?: number; max?: number } } }
```

The same pattern works for any deep transformation — `DeepReadonly<T>`, `DeepRequired<T>`, `DeepNullable<T>`. The structure is always: check for array → recurse into elements, else → mapped type with modifier + recursion.

**Where to use**: Configuration overrides (merge partial config over defaults), patch/update payloads for nested objects, test fixtures where you only specify the fields you care about.

## 9. Conditional Rest Parameters

Make function arguments required or forbidden based on the type.

```ts
type Events = {
  click: { x: number; y: number };
  focus: undefined;
};

const emit = <K extends keyof Events>(
  event: K,
  ...args: Events[K] extends undefined ? [] : [payload: Events[K]]
) => { /* ... */ };

emit('click', { x: 1, y: 2 }); // payload required
emit('focus');                   // no payload allowed
emit('click');                   // error: missing payload
```

**Where to use**: Event emitters, SSE dispatch, command patterns where some commands need payloads and others don't.

## 10. Generic React Components

```ts
interface TableProps<T> {
  rows: T[];
  renderRow: (row: T) => React.ReactNode;
}

const Table = <T,>(props: TableProps<T>) => (
  <table><tbody>
    {props.rows.map((row, i) => <tr key={i}>{props.renderRow(row)}</tr>)}
  </tbody></table>
);

// Usage: <Table rows={users} renderRow={(user) => <td>{user.name}</td>} />
// user is inferred as User
```

**Where to use**: List components, data tables, select/dropdown components, any component that renders a collection with a render prop.

## 11. Discriminated Union Props

```ts
type ModalProps =
  | { variant: 'no-title' }
  | { variant: 'title'; title: string };

const Modal = (props: ModalProps) => {
  if (props.variant === 'title') return <h2>{props.title}</h2>;
  return <div>No title</div>;
};

// <Modal variant="title" title="Hello" /> OK
// <Modal variant="title" />               error: missing title
// <Modal variant="no-title" />            OK
```

**Where to use**: Components with mutually exclusive prop combinations (upload form with URL vs file mode, billing card with active vs expired state).

## 12. useState with Discriminated Unions

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

const [state, setState] = useState<AsyncState<User>>({ status: 'idle' });

if (state.status === 'success') {
  state.data; // User — properly narrowed
}
if (state.status === 'error') {
  state.error; // string — properly narrowed
}
```

**Where to use**: Any async operation state (API calls, file uploads, AI generation). Replaces separate `isLoading`, `error`, `data` state variables.

## 13. Type-Safe Builder / Chaining Pattern

```ts
class QueryBuilder<TSelected extends Record<string, unknown> = {}> {
  select<K extends string, V>(
    key: K,
    value: V,
  ): QueryBuilder<TSelected & Record<K, V>> {
    // ...
    return this as unknown as QueryBuilder<TSelected & Record<K, V>>;
  }

  build(): TSelected {
    return this.data as TSelected;
  }
}

const result = new QueryBuilder()
  .select('name', 'John')
  .select('age', 30)
  .build();
// type: { name: string; age: number }
```

**Where to use**: Query builders, form builders, configuration DSLs. The Drizzle query builder and Elysia's route chain already use this pattern — understand it to use them effectively.

### Middleware chaining — transforming output type per step

A variant where each `.use()` transforms `TOutput` while keeping `TInput` fixed. Each step receives the previous step's output and returns a new type:

```ts
type Middleware<TInput, TOutput> = (input: TInput) => TOutput | Promise<TOutput>;

class DynamicMiddleware<TInput, TOutput> {
  private middleware: Middleware<any, any>[] = [];
  constructor(first: Middleware<TInput, TOutput>) { this.middleware.push(first); }

  use<TNewOutput>(
    mw: Middleware<TOutput, TNewOutput>,
  ): DynamicMiddleware<TInput, TNewOutput> {
    this.middleware.push(mw);
    return this as any; // TS can't track this transformation
  }

  async run(input: TInput): Promise<TOutput> {
    let result: any = input;
    for (const mw of this.middleware) result = await mw(result);
    return result;
  }
}

const pipeline = new DynamicMiddleware((req: Request) => ({
  ...req, userId: req.url.split('/')[2],
}))
  .use((ctx) => { /* ctx.userId is string */ return ctx; })
  .use(async (ctx) => ({ ...ctx, user: await fetchUser(ctx.userId) }));
// pipeline.run(req) → Promise<{ userId: string; user: User; ... }>
```

**Where to use**: Express/Elysia middleware chains, tRPC context builders, data transformation pipelines where each step enriches or transforms the context type.

## 14. `keyof typeof` for Config-Driven Types

```ts
const TOOL_META = {
  context: { label: 'Reading transcript', icon: FileTextIcon },
  read: { label: 'Reading content', icon: BookOpenIcon },
  retrieve: { label: 'Searching', icon: SearchIcon },
} as const;

type ToolKind = keyof typeof TOOL_META; // 'context' | 'read' | 'retrieve'

// Get all VALUES as a union (complement to keyof for keys):
type ToolConfig = typeof TOOL_META[keyof typeof TOOL_META];
// { label: 'Reading transcript'; icon: ... } | { label: 'Reading content'; icon: ... } | ...

// Adding a new tool to TOOL_META automatically extends both unions
```

### Indexed access distributes over unions

When you index into a type with a union of keys, TS distributes — returning a union of the corresponding value types:

```ts
// Union of keys → union of values:
type Subset = typeof programModeEnumMap["ONE_ON_ONE" | "SELF_DIRECTED"];
// "1on1" | "selfDirected"

// "All values except" — Exclude keys, then index:
type IndividualProgram = typeof programModeEnumMap[Exclude<
  keyof typeof programModeEnumMap,
  "GROUP" | "ANNOUNCEMENT"
>]; // "1on1" | "selfDirected" | "planned1on1" | "plannedSelfDirected"

// Indexed access on a discriminated union extracts the discriminator values:
type Event = { type: "click"; event: MouseEvent } | { type: "focus"; event: FocusEvent };
type EventType = Event["type"]; // "click" | "focus"

// Array element type from a const tuple:
const fruits = ["apple", "banana", "orange"] as const;
type Fruit = typeof fruits[number]; // "apple" | "banana" | "orange"
type FirstTwo = typeof fruits[0 | 1]; // "apple" | "banana"
```

**Where to use**: Enum-like maps (`as const` object → subset of values), extracting discriminator values from unions, getting element types from const arrays. Combine with `Exclude` to get "all values except" a subset.

## 15. ComponentProps & forwardRef

```ts
import { ComponentProps, forwardRef } from 'react';

// Extract props from existing component:
type ButtonProps = ComponentProps<'button'> & { variant: 'primary' | 'secondary' };

// Extract props from custom component:
type NavBarProps = ComponentProps<typeof NavBar>;

// forwardRef with proper types:
const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <input ref={ref} {...props} />
));
```

**Where to use**: Wrapper components around HTML elements or shadcn/ui components. Extending existing component props with additional fields.

## 16. Function Overloads

Declare multiple call signatures above an implementation signature. TS checks top-to-bottom — first matching overload wins. The implementation signature is NOT visible to callers.

```ts
// Most specific first, fallback last:
function getRolePrivileges(role: 'admin'): AdminPrivileges;
function getRolePrivileges(role: 'user'): UserPrivileges;
function getRolePrivileges(role: string): AnonymousPrivileges;
function getRolePrivileges(role: string): AdminPrivileges | UserPrivileges | AnonymousPrivileges {
  switch (role) {
    case 'admin': return { sitesCanDelete: [], sitesCanEdit: [], sitesCanVisit: [] };
    case 'user': return { sitesCanEdit: [], sitesCanVisit: [] };
    default: return { sitesCanVisit: [] };
  }
}

getRolePrivileges('admin').sitesCanDelete; // OK — AdminPrivileges
getRolePrivileges('other').sitesCanVisit;  // OK — AnonymousPrivileges
```

### Overloads vs conditional return types

Both solve "different return type per input". Overloads are better when there are finite known inputs; conditional return types are better for open-ended generics:

```ts
// Overloads — cleaner for small finite sets:
function flip(g: 'goodbye'): 'hello';
function flip(g: 'hello'): 'goodbye';
function flip(g: 'goodbye' | 'hello') { return g === 'goodbye' ? 'hello' : 'goodbye'; }

// Conditional return — better when generic:
type FlipResult<T> = T extends 'hello' ? 'goodbye' : 'hello';
const flip = <T extends 'hello' | 'goodbye'>(g: T): FlipResult<T> => ...;
```

### Generic + specific literal overload

Override behavior for specific inputs while keeping a generic fallback:

```ts
function process(t: 1): 2;
function process<T>(t: T): T;
function process(t: unknown) { return t === 1 ? 2 : t; }

process(1);   // type: 2 (specific overload wins)
process('a'); // type: 'a' (generic fallback)
```

### Overloads for conditional optionality

Return type changes based on whether an optional property is provided — the `useData` / `useQuery` pattern:

```ts
function useData<T>(params: { fetch: () => Promise<T> }): { getData: () => T | undefined };
function useData<T>(params: { fetch: () => Promise<T>; initialData: T }): { getData: () => T };
function useData<T>(params: { fetch: () => Promise<T>; initialData?: T }): { getData: () => T | undefined } {
  // implementation
}

useData({ fetch: fetchUser });                    // getData() → User | undefined
useData({ fetch: fetchUser, initialData: guest }); // getData() → User (no undefined)
```

### When NOT to use overloads

If all overloads return the same type, a union parameter is simpler:

```ts
// Overloads — unnecessary:
function run(gen: () => string): string;
function run(gen: { run: () => string }): string;

// Union — same result, less code:
function run(gen: (() => string) | { run: () => string }): string { ... }
```

### Overloads for function composition (pipe/compose)

Chain overloads where each signature adds one more step, linking return→input types:

```ts
function compose<T1, T2>(f1: (t: T1) => T2): (t: T1) => T2;
function compose<T1, T2, T3>(f1: (t: T1) => T2, f2: (t: T2) => T3): (t: T1) => T3;
function compose<T1, T2, T3, T4>(f1: (t: T1) => T2, f2: (t: T2) => T3, f3: (t: T3) => T4): (t: T1) => T4;
function compose(...fns: Array<(x: any) => any>) {
  return (input: any) => fns.reduce((acc, fn) => fn(acc), input);
}

compose(addOne, addOne, String)(4); // type: string, value: "6"
compose(String, addOne);            // error — addOne takes number, String returns string
```

**Where to use**: Middleware pipelines, data transformation chains, lodash `flow`/`pipe` equivalents. The type-level chaining catches mismatched step types at compile time.

**Where to use overloads generally**: Role-based return types, config functions with optional properties that change the return type, API wrappers where input format varies but output type differs, `querySelector`-style tag→type mappings, function composition.

## 17. Declaration Merging & Global Augmentation

### `declare global` — adding to the global scope

Use `declare global` inside any module file (one with imports/exports) to add types, functions, or variables to the global scope. Use `var` (not `let`/`const`) for variables, and assign via `globalThis`:

```ts
declare global {
  function myGlobalHelper(): boolean;
  var myGlobalConfig: { debug: boolean };
}

globalThis.myGlobalHelper = () => true;
globalThis.myGlobalConfig = { debug: false };
```

### Window & process.env augmentation

Augment existing global interfaces via declaration merging — the interface keyword merges across declarations:

```ts
// Add properties to window (e.g. analytics scripts, feature flags):
declare global {
  interface Window {
    analytics: { track: (event: string) => void };
  }
}
window.analytics.track('page_view'); // typed

// Bulk-add from a runtime object — derive type, then extend Window:
const windowAdditions = { add: (a: number, b: number) => a + b, subtract: (a: number, b: number) => a - b };
Object.assign(window, windowAdditions);
declare global { interface Window extends typeof windowAdditions {} }
window.add(1, 2); // typed — (a: number, b: number) => number

// Type process.env vars — removes `| undefined`:
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL: string;
      NODE_ENV: 'development' | 'production' | 'test';
    }
  }
}
process.env.DATABASE_URL; // string (not string | undefined)
```

### Extensible interfaces via declaration merging

Interfaces merge across files — each module can add its own entries. Combined with a mapped type, this creates a discriminated union that grows automatically as modules register new variants:

```ts
// events.ts — base file
declare global {
  interface AppEvents {
    LOG_IN: { username: string; password: string };
  }
  // Auto-builds discriminated union from all registered events:
  type AppEvent = {
    [K in keyof AppEvents]: { type: K } & AppEvents[K];
  }[keyof AppEvents];
}

// another-module.ts — adds events via declaration merging
declare global {
  interface AppEvents {
    LOG_OUT: {};
    UPDATE_USERNAME: { username: string };
  }
}

// AppEvent is now:
// | { type: 'LOG_IN'; username: string; password: string }
// | { type: 'LOG_OUT' }
// | { type: 'UPDATE_USERNAME'; username: string }

const dispatch = (event: AppEvent) => { /* ... */ };
dispatch({ type: 'LOG_IN', username: 'a', password: 'b' }); // OK
dispatch({ type: 'LOG_OUT' });                                // OK
```

**Where to use**: Plugin/extension systems where modules register their own events/commands/routes. Global event dispatch. Feature flags. Any system where a central type needs to grow as new modules are added — without editing a single file.

### `declare module` — override or provide types for external libraries

Use `declare module "lib-name"` in a `.d.ts` file to add types for an untyped library, or override/augment types in a typed one:

```ts
// fix-animation-lib.d.ts — provide types for an untyped library
declare module "animation-lib" {
  export type AnimatingState = "before-animation" | "animating" | "after-animation";
  export function getAnimatingState(): AnimatingState;
}

// Now imports are typed:
import { getAnimatingState } from "animation-lib";
getAnimatingState(); // AnimatingState (not `any`)
```

**`declare global` vs `declare module`**: `declare global` adds to the global scope (Window, process.env). `declare module "x"` targets a specific npm package's type surface. Both use interface merging for augmentation.

**Where to use**: Untyped third-party libraries (no `@types/*` package), libraries with incorrect/incomplete types you need to fix, adding custom properties to existing library types.

### `z.ZodType<T>` — generic functions accepting any Zod schema

When writing a function that takes a Zod schema as a parameter, use `z.ZodType<T>` (or equivalently `z.Schema<T>`) so TS infers the validated type:

```ts
const makeZodSafeFunction = <TValue, TResult>(
  schema: z.ZodType<TValue>,
  func: (arg: TValue) => TResult,
) => (arg: TValue) => func(schema.parse(arg));

const addTwo = makeZodSafeFunction(
  z.object({ a: z.number(), b: z.number() }),
  (args) => args.a + args.b, // args inferred as { a: number; b: number }
);
```

**Where to use**: Validation-wrapper factories, form submit handlers, API route handlers that accept a schema + handler pair. `z.ZodType<T>` accepts any Zod schema (objects, transforms, pipes, etc.) while `z.ZodObject<T>` is too restrictive.

## Anti-Patterns to Catch in Review

| Anti-Pattern | Fix |
|---|---|
| `any` type | `unknown` + type guard, or proper generic |
| `as T` without justification | Type guard, discriminated union, or fix the source type |
| `value!` non-null assertion | Optional chaining `?.`, nullish coalescing `??`, or type guard |
| Separate `isLoading` + `error` + `data` state | Single `AsyncState<T>` discriminated union |
| `switch` without `default: never` | Add exhaustive check |
| String literal unions hand-maintained | Derive from `as const` config with `keyof typeof` |
| `(id: string)` for entity IDs | Branded types `(id: AssetId)` (when worth the overhead) |
| `Object.keys(obj)` returning `string[]` | Use `(Object.keys(obj) as Array<keyof typeof obj>)` or type guard |
| Manual type narrowing in filter | Type predicate: `.filter((x): x is T => ...)` |
| `.reduce((acc, item) => ..., {})` with wrong accumulator type | `.reduce<Record<string, T>>((acc, item) => ..., {})` — explicit type arg |
| Generic on root object then indexing `TConfig["a"]["b"]["c"]` | Put generic on the leaf type directly: `<TLeaf>(obj: { a: { b: { c: TLeaf } } })` |
| `<T>(statuses: T[])` loses literal types (infers `string[]`) | `<T extends string>(statuses: T[])` — constraint preserves `"INFO" \| "DEBUG"` literals |
| Single function needing both explicit + inferred type args | Curried generics: outer function captures config type, inner uses it |
| Function returning `"hello" \| "goodbye"` union when input determines which | Conditional return type: `T extends "hello" ? "goodbye" : "hello"` |
| `(key: string, value: any)` setter losing type safety | Indexed access: `<K extends keyof T>(key: K, value: T[K])` — links key to value type |
| Overloads where all signatures return the same type | Union parameter instead — overloads only add value when return type varies per input |
| Overloads ordered least-specific first (fallback before literals) | Most specific overload first — TS matches top-to-bottom, first match wins |
| `useData()` returning `T \| undefined` even when `initialData` is provided | Overload pair: with `initialData` → `T`, without → `T \| undefined` |
| `<T = unknown>` on functions requiring explicit type arg | `<T = "You must pass a type argument">` — descriptive default as documentation |
| Hand-written string param extraction for i18n/routes | Template literal + `infer` recursive type: `GetParamKeys<"/{id}/posts/{postId}">` → `["id", "postId"]` |
| Multi-step pipeline with no compile-time ordering enforcement | Brand each step's output — downstream functions require branded inputs from prior steps |
| `Record<string, Post \| User>` for heterogeneous entity store | Branded index signatures: `{ [id: PostId]: Post; [id: UserId]: User }` — key type determines value type |
| `let`/`const` in `declare global` for variables | Use `var` — only `var` and `function` work in ambient global declarations |
| Hand-maintained union of event types across modules | Global interface + mapped type: modules add to interface, union auto-builds via `{ [K in keyof I]: ... }[keyof I]` |
| `process.env.MY_VAR` typed as `string \| undefined` | `declare global { namespace NodeJS { interface ProcessEnv { MY_VAR: string } } }` — removes `undefined` |
| Arrow function with `asserts` return type | Use `function` declaration — arrow functions do NOT support `asserts` (TS gives a cryptic error) |
| `.filter(Boolean) as T[]` to remove `undefined` from arrays | `.filter((x): x is T => Boolean(x))` — type predicate narrows without cast |
| Standalone assertion function checking class state (loses `this` narrowing) | `asserts this is this & { prop: T }` on class method — narrows instance properties in subsequent code |
| Class with optional property + manual cast after check (`this.user as User`) | `this is this & { user: User }` predicate method — no cast, TS narrows automatically |
| Middleware chain typed as `Middleware<any, any>[]` losing per-step types | Generic `.use<TNewOutput>()` returning `DynamicMiddleware<TInput, TNewOutput>` — each step is typed |
| `// @ts-ignore` or `as any` on untyped library imports | `declare module "lib-name"` in a `.d.ts` file to provide proper types |
| `z.ZodObject<T>` as generic parameter type for Zod schemas | `z.ZodType<T>` — accepts all Zod types (objects, transforms, pipes, unions), not just objects |
| Manually retyping external function's params/return for a wrapper | `Parameters<typeof fn>` + `Awaited<ReturnType<typeof fn>>` — stays in sync when lib updates |
| Generic inferred from wrong position (`initial: 'c'` widens `TState` to include `'c'`) | `NoInfer<TState>` on the check-only position — inference comes only from the defining position |
| Explicit type annotation on config object `ConfigObj<"/" \| "/about">` duplicating values | Identity function `makeConfig<T>(config: ConfigObj<T>)` — infers T from one field, constrains the other |
| `(name: string)` in per-key event handler callbacks | Reverse mapped type `{ [K in keyof T]: (name: K) => void }` — each callback gets its own literal key type |
| `<T>(t: T)` identity function + `as const` at every call site | `<const T>(t: T)` — `const` type parameter preserves literals without caller-side `as const` |
| Const array lookup returning base interface (`Fruit`) instead of specific element | `Extract<TFruits[number], { name: TName }>` with `<const T>` — returns `{ name: "apple"; price: 1 }` not `Fruit` |
| Manually listing each property in `interface Window { ... }` for bulk augmentation | `interface Window extends typeof obj` — derive type from runtime object, merge all properties at once |
| Manually listing enum values in a type union | `typeof obj[keyof typeof obj]` from an `as const` object — values union stays in sync automatically |
| `Extract<Route, { route: R }>["search"]` in mapped type over discriminated union | `[R in Route as R["route"]]: R["search"]` — iterate over whole members, `as` extracts key directly |
| Manually listing `["email", string] \| ["name", string]` entry tuples | `{ [K in keyof T]: [K, T[K]] }[keyof T]` — mapped type + `[keyof T]` index auto-generates the union |
| `Extract` on a discriminated union just to get the discriminator literal | `Union["type"]` — indexed access on a union distributes, no utility type needed |
| `(route: string)` accepting any string for paths/URLs | Template literal pattern type `` `/${string}` `` — validates shape at compile time |
| Manually listing dynamic routes from a union | `Extract<Routes, \`${string}:${string}\`>` — filter by template literal pattern |
| `<T>` unconstrained generic accepting `null`/`undefined` when it shouldn't | `<T extends {}>` — `{}` means any non-nullish value, excludes `null` and `undefined` |
| `(values: string[])` accepting empty arrays that break at runtime | `NonEmptyArray<T> = [T, ...T[]]` — compiler rejects `[]` |
| `T extends { data: any } ? T["data"] : never` using indexed access in conditional | `T extends { data: infer D } ? D : never` — `infer` is cleaner and self-documenting |
| Chained `T extends A ? ... : T extends B ? ... : T extends C ? ...` for same extraction | Union of patterns: `T extends A \| B \| C ? R : never` with same `infer R` in each — single branch |
| `RawUnion extends X ? RawUnion : never` returning `never` unexpectedly | Distribution requires a generic — wrap in `type Helper<T> = T extends X ? T : never` then `Helper<RawUnion>` |
| `[R in Route as R["route"]]: R["search"]` when some members lack `search` | `R extends { search: infer S } ? S : never` on the value side — conditional extraction for optional properties |
| `Partial<T>` on nested config objects (only makes top-level optional) | `DeepPartial<T>` recursive type with array special-casing — makes all levels optional |
