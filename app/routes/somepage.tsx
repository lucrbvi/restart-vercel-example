import { getServerTime } from "@/server/react"
import { useState } from "react"

// Native server action example
async function serverGreeting(name: string) {
    "use server"
    return `Hello from server action, ${name}! Time: ${new Date().toISOString()}`
}

function Click() {
    "use client"
    const [count, setCount] = useState(0)
    const [greeting, setGreeting] = useState("")
    
    const handleServerAction = async () => {
        const result = await serverGreeting("React User")
        setGreeting(result)
    }
    
    return (
        <div>
            <button onClick={() => setCount(count + 1)}>Count: {count}</button>
            <br />
            <button onClick={handleServerAction}>Test Server Action</button>
            {greeting && <p>Server Response: {greeting}</p>}
        </div>
    )
}

export default async function Page() {
    const serverTime = await getServerTime()
    return (
        <div>
            <h1>There is some stuff here (I am server made)</h1>
            <a href="/">Go back to the home page</a>
            <p>Server time: {serverTime} (proof this is server made)</p>
            <Click />
        </div>
    )
}