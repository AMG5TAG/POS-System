import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/* The online shop lives under /shop — in production as well as development.
   Replit routes a deployment by PATH, never by host, and "/" belongs to the POS
   everywhere; the shop domain's "/" is redirected to "/shop/" by the POS's
   index.html. The base is fixed rather than read from BASE_PATH: the workspace
   sets BASE_PATH=/ globally, and a shop built for "/" asks for /assets/*, which
   the POS answers — a blank shop page. */
export default defineConfig(({ command }): UserConfig => {
  const isServe = command === "serve";
  const port = process.env.PORT ? Number(process.env.PORT) : undefined;
  if (isServe && !port) throw new Error("PORT environment variable is required but was not provided.");
  return {
    base: "/shop/",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") }, dedupe: ["react", "react-dom"] },
    root: path.resolve(import.meta.dirname),
    build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true },
    server: { port, strictPort: true, host: "0.0.0.0", allowedHosts: true },
    preview: { port, host: "0.0.0.0", allowedHosts: true },
  };
});
