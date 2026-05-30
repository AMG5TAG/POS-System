---
name: Orval hook query options
description: All Orval-generated useXxx query hooks require queryKey in the query options — omitting it causes TS2741.
---

# Orval generated hook query options

When calling a generated Orval `useXxx` hook with custom query options, always include `queryKey`:

```ts
// CORRECT
useGetDailyCloseCurrent({
  query: { enabled: open, staleTime: 60000, queryKey: ["daily-close-current"] },
});

// WRONG — TS2741: Property 'queryKey' is missing
useGetDailyCloseCurrent({
  query: { enabled: open, staleTime: 60000 },
});
```

**Why:** The Orval-generated `UseQueryOptions` type requires `queryKey` as a required field in the `query` override object. This applies to all hooks where you pass `{ query: { ... } }` as the second argument.

**How to apply:** Any time you write `useXxx({ query: { ... } })`, add `queryKey: ["some-unique-key"]` to the query options object.
