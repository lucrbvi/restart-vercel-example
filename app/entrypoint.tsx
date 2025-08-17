/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { hydrateRoot } from "react-dom/client"
import { App } from "./App"

try {
    hydrateRoot(document.getElementById("root")!, <App />)
} catch (e) {
    console.error("hydratation error:", e)
}