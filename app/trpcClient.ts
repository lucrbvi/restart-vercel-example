import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '../server/index'
import { restartConfig } from '../restart.config'

export const trpc = ((): ReturnType<typeof createTRPCProxyClient<AppRouter>> | null => {
    if (typeof window === "undefined") {
      return null // prevent creating the tRPC client in the server
    }
    return createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: restartConfig.trpcEndpoint,
        }),
      ],
    })
  })()