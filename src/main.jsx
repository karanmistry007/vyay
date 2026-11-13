import React from "react";
import { createRoot } from "react-dom/client";

/* Self-hosted so the app never asks the network for anything, ever. */
import "@fontsource-variable/manrope/wght.css";

import App from "./App.jsx";
import "./styles.css";
import { registerServiceWorker } from "./lib/pwa.js";

createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);

registerServiceWorker({
  onUpdateReady: (apply) => window.dispatchEvent(new CustomEvent("vyay:update-ready", { detail: { apply } })),
  onOfflineReady: () => window.dispatchEvent(new CustomEvent("vyay:offline-ready")),
});
