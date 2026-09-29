import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/* The online shop. In production it is served by the API server for the shop
   domain (see app.ts) at base "/". In development it runs on its own port behind
   the /shop-preview path, like the POS runs behind "/". */
export default defineConfig(({ command }): UserConfig => {
  const isServe = command === "serve";
  const port = process.env.PORT ? Number(process.env.PORT) : undefined;
  if (isServe && !port) throw new Error("PORT environment variable is required but was not provided.");
  return {
    base: process.env.BASE_PATH ?? "/",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") }, dedupe: ["react", "react-dom"] },
    root: path.resolve(import.meta.dirname),
    build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true },
    server: { port, strictPort: true, host: "0.0.0.0", allowedHosts: true },
    preview: { port, host: "0.0.0.0", allowedHosts: true },
  };
});
