"use client"

import { useEffect, useState } from "react"
import { trpc } from "./entrypoint"
import { create } from 'zustand'

function getBrowserName() {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('firefox')) return 'Firefox';
    if (userAgent.includes('edg')) return 'Edge';
    if (userAgent.includes('chrome')) return 'Chrome';
    if (userAgent.includes('safari')) return 'Safari';
    if (userAgent.includes('opera') || userAgent.includes('opr')) return 'Opera';
    
    return 'Inconnu';
}

const useCount = create((set) => ({
    count: 0,
    inc: () => set((state) => ({ count: state.count +1 })),
  }))

export function App() {
  const [greeting, setGreeting] = useState<string>("Loading...")
  const { count, inc } = useCount()

  useEffect(() => {
    console.log("useEffect")
    if (!trpc) return

    trpc.getName.query(getBrowserName(), { })
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
      <button onClick={inc}>+</button>
    </div>
  );
}