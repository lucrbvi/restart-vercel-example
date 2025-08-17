"use client"

/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 * 
 * It is include in the `Body()` element in the server (`server/index.tsx`)
 */

import { hydrateRoot } from "react-dom/client"
import { App } from "./App"
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '../server/index'

export const trpc = ((): ReturnType<typeof createTRPCClient<AppRouter>> | null => {
  if (typeof window === "undefined") {
    return null // prevent creating the tRPC client in the server
  }
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: "http://localhost:3001",
      }),
    ],
  })
})()

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