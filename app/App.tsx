"use client"

import { useEffect, useState } from "react"
import { trpc } from "./entrypoint"

function getBrowserName() {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('firefox')) return 'Firefox';
    if (userAgent.includes('edg')) return 'Edge';
    if (userAgent.includes('chrome')) return 'Chrome';
    if (userAgent.includes('safari')) return 'Safari';
    if (userAgent.includes('opera') || userAgent.includes('opr')) return 'Opera';
    
    return 'Inconnu';
}

export function App() {
  const [count, setCount] = useState(0);
  const [greeting, setGreeting] = useState<string>("Loading...")

  useEffect(() => {
    if (!trpc) return

    trpc.getName.query(getBrowserName())
      .then((res) => setGreeting(res))
      .catch((err) => {
        console.error("tRPC error:", err)
        setGreeting("Error!")
      }, [])
  })

  return (
    <div className="flex flex-col text-4xl items-center justify-center min-h-screen bg-gray-100">
      <h1>
        {greeting} — you have clicked {count} times!
      </h1>
      <button onClick={() => setCount(count + 1)}>+</button>
    </div>
  );
}