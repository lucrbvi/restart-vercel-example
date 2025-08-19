"use client"

import { useState, useEffect } from "react"
import { create } from 'zustand'
import { getName } from "../shared/functions"

function getBrowserName() {
    const userAgent = navigator.userAgent.toLowerCase()
    
    if (userAgent.includes('firefox')) return 'Firefox'
    if (userAgent.includes('edg')) return 'Edge'
    if (userAgent.includes('chrome')) return 'Chrome'
    if (userAgent.includes('safari')) return 'Safari'
    if (userAgent.includes('opera') || userAgent.includes('opr')) return 'Opera'
    
    return 'Unknown'
}

type CountState = { count: number; inc: () => void }
const useCount = create<CountState>((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
}))

export function App() {
  const { count, inc } = useCount()
  const [greeting, setGreeting] = useState<string>("Loading...")

  useEffect(() => {
    getName(getBrowserName())
      .then((res: string) => setGreeting(res))
      .catch((err: string) => {
        console.error("tRPC error:", err)
        setGreeting("Error!")
      })
  }, [])

  return (
    <div className="flex flex-col text-4xl items-center justify-center min-h-screen bg-gray-100">
      <h1>
        {greeting} — you have clicked {count} times!
      </h1>
      <button onClick={inc}>+</button>
    </div>
  );
}

export function Body() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Restart</title>
        <link rel="stylesheet" href="/styles.css" />
        <link rel="icon" type="image/svg+xml" href="/react.svg"></link>
      </head>
      <body>
        <div id="root">
          <App />
        </div>
        <script
          type="module"
          src="/entrypoint.js"
          crossOrigin="anonymous"
        ></script>
      </body>
    </html>
  )
}