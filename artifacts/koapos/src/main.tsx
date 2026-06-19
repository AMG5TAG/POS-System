import { createRoot } from "react-dom/client";
import App from "./App";
import { installStaleChunkReload } from "./lib/lazy-retry";
import "./index.css";

// Recover from stale code-split chunks after a deploy (see lazy-retry.ts).
installStaleChunkReload();

createRoot(document.getElementById("root")!).render(<App />);
