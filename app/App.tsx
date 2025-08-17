import { useState } from "react"

export function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="text-center text-5xl">
      <h1>Hello, world! {count}</h1>
      <button onClick={() => setCount(count + 1)}>More number!</button>
    </div>
  )
}