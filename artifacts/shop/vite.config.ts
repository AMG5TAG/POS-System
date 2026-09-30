import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/* Built for "/": in production artifacts/koapos/server.mjs serves it at the root
   of the shop domain (Replit routes by path, so that server picks by host). In
   development it runs behind the /shop preview path. Neither base is read from
   BASE_PATH, which the workspace sets to "/" globally. */
export default defineConfig(({ command }): UserConfig => {
  const isServe = command === "serve";
  const port = process.env.PORT ? Number(process.env.PORT) : undefined;
  if (isServe && !port) throw new Error("PORT environment variable is required but was not provided.");
  return {
    base: isServe ? "/shop/" : "/",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") }, dedupe: ["react", "react-dom"] },
    root: path.resolve(import.meta.dirname),
    build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true },
    server: { port, strictPort: true, host: "0.0.0.0", allowedHosts: true },
    preview: { port, host: "0.0.0.0", allowedHosts: true },
  };
});
