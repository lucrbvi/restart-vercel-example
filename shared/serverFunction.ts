import ZodTypeAny from "zod"
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client"
import type { AppRouter } from "../server/index"
import { registry } from "./trpcRegistry"

const trpc = typeof window !== "undefined"
  ? createTRPCProxyClient<AppRouter>({
      links: [httpBatchLink({ url: "/trpc" })],
    })
  : null

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