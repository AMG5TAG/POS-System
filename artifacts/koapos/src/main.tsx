import { createRoot } from "react-dom/client";
import App from "./App";
import { installStaleChunkReload } from "./lib/lazy-retry";
import { installPhoneLinkGuard } from "./lib/phone-link-guard";
import "./index.css";

// Recover from stale code-split chunks after a deploy (see lazy-retry.ts).
installStaleChunkReload();

// Desktop Chrome can hang or crash handing a tel: link to the OS (see phone-link-guard.ts).
installPhoneLinkGuard();

createRoot(document.getElementById("root")!).render(<App />);
