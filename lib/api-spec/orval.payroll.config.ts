import { defineConfig } from "orval";
import path from "path";

// Isolated codegen for the Payroll API.
//
// The main `orval.config.ts` regenerates the whole client from `openapi.yaml`
// with `clean: true`. That spec has drifted behind the committed client, so
// running it would delete endpoints. To add payroll safely we generate from a
// standalone spec into a SEPARATE output folder (`generated-payroll`), leaving
// the existing `generated` folder untouched.
const root = path.resolve(__dirname, "..", "..");
const apiClientReactSrc = path.resolve(root, "lib", "api-client-react", "src");

export default defineConfig({
  "payroll-client": {
    input: {
      target: "./payroll.openapi.yaml",
    },
    output: {
      workspace: apiClientReactSrc,
      target: "generated-payroll",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
});
