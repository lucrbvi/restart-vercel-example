"use client"

/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 * 
 * It is include in the `Body()` element in the server (`server/index.tsx`)
 */

import { hydrateRoot } from "react-dom/client"
import { App } from "@/App"

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
        const rootElement = document.getElementById("root")
        if (rootElement) {
            hydrateRoot(rootElement, <App/>)
        } else {
            console.error("Root element not found")
        }
    } catch (e) {
        console.error("Hydration error:", e)
    }
}