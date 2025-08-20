import { getServerTime } from "@/server"
import { useState } from "react"

function Click() {
    "use client"
    const [count, setCount] = useState(0)
    return (
        <button onClick={() => setCount(count + 1)}>{count} (I am a client component)</button>
    )
}

export default async function Page() {
    const serverTime = await getServerTime(undefined as any)
    return (
        <div>
            <h1>There is some stuff here (I am server made)</h1>
            <a href="/">Go back to the home page</a>
            <p>Server time: {serverTime} (proof this is server made)</p>
            <Click />
        </div>
    )
}