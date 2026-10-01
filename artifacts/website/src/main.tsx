import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// OpenDyslexic (OFL-1.1), self-hosted for the Accessibility menu's
// dyslexia-friendly font. Browsers only download it once it is switched on.
import "@fontsource/opendyslexic/400.css";
import "@fontsource/opendyslexic/700.css";

createRoot(document.getElementById("root")!).render(<App />);
