import { createTRPCProxyClient, httpBatchLink } from "@trpc/client"
import type { AppRouter } from "server"
import { registry } from "./trpcRegistry"
import ZodTypeAny from "zod"

// Server Actions Registry for native React server actions
const serverActionRegistry = new Map<string, (...args: any[]) => any>()

const trpc = typeof window !== "undefined"
  ? createTRPCProxyClient<AppRouter>({
      links: [httpBatchLink({ url: "/trpc" })],
    })
  : null

  /**
 * Register a server action implementation
 */
export function registerServerAction(name: string, impl: (...args: any[]) => any) {
  serverActionRegistry.set(name, impl)
}

/**
 * Get a server action implementation
 */
export function getServerAction(name: string) {
  return serverActionRegistry.get(name)
}

/**
 * Call a server action from client side
 */
export async function callServerAction(name: string, args: any[]): Promise<any> {
  if (typeof window === "undefined") {
    // Server side - execute directly
    const impl = serverActionRegistry.get(name)
    if (!impl) {
      throw new Error(`Server action ${name} not found`)
    }
    return await impl(...args)
  } else {
    // Client side - make HTTP request
    const response = await fetch('/__server_actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: name, args }),
    })
    
    if (!response.ok) {
      throw new Error(`Server action failed: ${response.statusText}`)
    }
    
    const result = await response.json()
    if (result.error) {
      throw new Error(result.error)
    }
    
    return result.data
  }
}

/**
 * A wrapper to create tRPC functions on server side.
 * @param name The name of the function in the registry.
 * @param kind Only "query" or "mutation", refer to the [tRPC documentation](https://trpc.io/docs/concepts#vocabulary).
 * @param input The input type of the function.
 * @param resolve The code of your server function.
 * @returns A function that can be called from the client side.
 */
export function serverFunction<I, O>(
  name: string,
  kind: "query" | "mutation",
  input: ZodTypeAny,
  resolve: (opts: { input: I }) => O | Promise<O>
): (arg: I) => Promise<O> {
    registry.push({ name, kind, input, resolve })
    
    return async (arg: I): Promise<O> => {
        if (typeof window === "undefined") {
        return await resolve({ input: arg })
        }
        if (!trpc) throw new Error("tRPC client unavailable")
        return kind === "query" ? await trpc[name].query(arg) : await trpc[name].mutate(arg)
    }
}