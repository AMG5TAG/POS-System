/**
 * Creates a chainable mock for the drizzle `db` object.
 * Every method call returns the same chain; awaiting it resolves to [].
 * This lets validation tests run without a real DB connection.
 */
export function makeDbMock() {
  const chain: Record<string, unknown> & { then?: unknown } = new Proxy(
    {} as Record<string, unknown>,
    {
      get(_t, k) {
        if (k === "then") {
          return (
            resolve: (value: unknown[]) => unknown,
            _reject?: unknown,
          ) => Promise.resolve([]).then(resolve);
        }
        if (k === "catch") return () => chain;
        if (k === "finally") return () => chain;
        return () => chain;
      },
    },
  );
  return chain;
}

export const dbMock = makeDbMock();

/** A table shim — drizzle tables are just used as identifiers in query builders. */
export const tableMock = new Proxy({} as Record<string, unknown>, {
  get: () => tableMock,
});
