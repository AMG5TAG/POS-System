import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // The app's JSX is transformed by Vite's React plugin, which the test runner
  // does not load; tsconfig says "preserve", so esbuild would fall back to the
  // classic transform and every component render fails with "React is not
  // defined". Naming the automatic runtime here is what lets a test render a
  // print component and assert on its markup.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    globals: true,
    fakeTimers: {
      shouldAdvanceTime: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
