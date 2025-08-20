/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 * 
 * It is include in the `Body()` element in the server (`server/index.tsx`)
 */

import { hydrateRoot, createRoot } from "react-dom/client"
import { App } from "@/App"
import { Router } from "wouter"

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
        const rootElement = document.getElementById("root")
        if (rootElement) {
            const app = (
              <Router>
                <App/>
              </Router>
            )
            const hasSSRContent = rootElement.firstElementChild !== null
            if (hasSSRContent) {
              hydrateRoot(rootElement, app)
            } else {
              createRoot(rootElement).render(app)
            }
        } else {
            console.error("Root element not found")
        }
    } catch (e) {
        console.error("Hydration error:", e)
    }
}