/**
 * This server is used as a *dev* server.
 * You can also use it as a production server like a good old consistant server.
 */

import { serve, file } from "bun"
import type { Server } from "bun"
import { publicProcedure, router } from './trpc'
import {createBunServeHandler} from 'trpc-bun-adapter'
import { restartConfig } from "../restart.config"
import ZodTypeAny from "zod"
import { registry } from "../shared/trpcRegistry"
import { build, buildCss } from "../build"
import { middlewares, type MiddlewareContext } from "./middlewares"

// tRPC section

type Kind = "query" | "mutation"
type Entry = { name: string; kind: Kind; input: ZodTypeAny; resolve: (opts: { input: any }) => any }

function registerFunction(entry: Entry) {
  if (entry.kind === "query") {
    return publicProcedure.input(entry.input).query(({ input }: { input: any }) => entry.resolve({ input }))
  } else {
    return publicProcedure.input(entry.input).mutation(({ input }: { input: any }) => entry.resolve({ input }))
  }
}

export function createAppRouter() {
  return router(
    Object.fromEntries(
      registry.map((entry) => [entry.name, registerFunction(entry as Entry)])
    )
  )
}

export type AppRouter = ReturnType<typeof createAppRouter>

// server section

if (import.meta.main) { // it stop the server to run if we import `Body()`
  const argv = Bun.argv.slice(2)
  const isStaticMode = argv.includes("--static")
  const isDevMode = argv.includes("--dev")
  const mode = isStaticMode ? "static" : (isDevMode ? "dev" : "prod")

  // Ensure environment hints for libraries that read NODE_ENV
  try {
    if (isDevMode) {
      process.env.NODE_ENV = "development"
    } else {
      process.env.NODE_ENV = "production"
    }
  } catch {}

  console.log(`Starting server in ${mode} mode`)

  if (!isStaticMode) {
    try {
      await import("app/server")
    } catch (e) {
      console.warn("Warning: could not preload server functions:", e)
    }
  }

  const trpcHandler = !isStaticMode
    ? createBunServeHandler({
        router: createAppRouter(),
        endpoint: restartConfig.trpcEndpoint,
        responseMeta() {
          return {
            status: 200,
            headers: {
            }
          }
        },
      })
    : null

  if (isStaticMode) {
    console.log("Static: skipping client build")
  } else {
    if (isDevMode) {
      await buildCss(true)
    } else {
      console.log("Building client...")
      try{
        await build()
        console.log("Client built")
      } catch (e) {
        console.error("Building error:", e)
        process.exit(1)
      }
    }
  }

  const server = serve({
    port: restartConfig.port,
    development: isDevMode,
    async fetch(this: Server, req: Request, server: Server): Promise<Response> {
      const path = new URL(req.url).pathname
      const ctx: MiddlewareContext = {
        req,
        server,
        path,
        isDevMode,
        isStaticMode,
        state: {},
      }

      for (const m of middlewares) {
        if (m.onRequest) {
          const maybeResponse = await m.onRequest(ctx)
          if (maybeResponse) {
            let res = maybeResponse
            for (const mm of middlewares) {
              if (mm.onResponse) {
                res = await mm.onResponse(ctx, res)
              }
            }
            return res
          }
        }
      }
      
      if (!isStaticMode && path.startsWith(restartConfig.trpcEndpoint)) {
        const trpcResponse = await trpcHandler!.fetch(req, server)
        const res = trpcResponse ?? new Response("Not found (404)", { status: 404 })
        let finalRes = res
        for (const m of middlewares) {
          if (m.onResponse) {
            finalRes = await m.onResponse(ctx, finalRes)
          }
        }
        return finalRes
      }

      if (path === "/") {
        try {
          if (isStaticMode) {
            const html = file("dist/index.html")
            let res = new Response(html, {
              headers: {
                "Content-Type": "text/html",
              }
            })
            for (const m of middlewares) {
              if (m.onResponse) {
                res = await m.onResponse(ctx, res)
              }
            }
            return res
          }
          const { renderToReadableStream } = await import("react-dom/server")
          const { Body } = await import("app/App")
          const stream = await renderToReadableStream(<Body/>, {})
          let res = new Response(stream, {
            headers: { 
              "Content-Type": "text/html",
              "Cache-Control": isDevMode ? "no-cache" : "public, max-age=0"
            },
          })
          for (const m of middlewares) {
            if (m.onResponse) {
              res = await m.onResponse(ctx, res)
            }
          }
          return res
        } catch (e) {
          console.error("SSR error:", e)
          let res = new Response("Server Error (500)", { status: 500 })
          for (const m of middlewares) {
            if (m.onResponse) {
              res = await m.onResponse(ctx, res)
            }
          }
          return res
        }
      }

      if (path.endsWith(".html")) {
        const Filepath = path.split("/").pop()
        const publicFile = file("dist/" + Filepath)
        let res = new Response(publicFile, {
          headers: { "Content-Type": "text/html"}
        })
        for (const m of middlewares) {
          if (m.onResponse) {
            res = await m.onResponse(ctx, res)
          }
        }
        return res
      }
      
      if (path.endsWith(".txt")) {
        const Filepath = path.split("/").pop()
        const publicFile = file("public/" + Filepath)
        let res = new Response(publicFile, {
          headers: { "Content-Type": "text/plain"}
        })
        for (const m of middlewares) {
          if (m.onResponse) {
            res = await m.onResponse(ctx, res)
          }
        }
        return res
      }

      if (path.endsWith(".css")) {
        const Filepath = path.split("/").pop()
        const publicFile = file("dist/" + Filepath)
        let res = new Response(publicFile, {
          headers: { "Content-Type": "text/css"}
        })
        for (const m of middlewares) {
          if (m.onResponse) {
            res = await m.onResponse(ctx, res)
          }
        }
        return res
      }

      if (path.endsWith(".svg")) {
        const Filepath = path.split("/").pop()
        const publicFile = file("public/" + Filepath)
        let res = new Response(publicFile, {
          headers: { "Content-Type": "image/svg+xml"}
        })
        for (const m of middlewares) {
          if (m.onResponse) {
            res = await m.onResponse(ctx, res)
          }
        }
        return res
      }

      if (path.endsWith(".js")) {
        const Filepath = path.split("/").pop()
        const publicFile = file("dist/" + Filepath)
        let res = new Response(publicFile, {
          headers: { "Content-Type": "application/javascript"}
        })
        for (const m of middlewares) {
          if (m.onResponse) {
            res = await m.onResponse(ctx, res)
          }
        }
        return res
      }

      {
        let res = new Response("Page not found (404)", { status: 404 })
        for (const m of middlewares) {
          if (m.onResponse) {
            res = await m.onResponse(ctx, res)
          }
        }
        return res
      }
    },
    websocket: {
      message: () => {
        console.log("websocket message")
      }
    }
  })

  console.log(`✅ Web server online on ${server.url}`)
}