/**
 * This server is used as a *dev* server.
 * You can also use it as a production server like a good old consistant server.
 */

import { serve, file } from "bun"
import type { Server } from "bun"
import { renderToReadableStream } from "react-dom/server"
import { publicProcedure, router } from './trpc'
import {createBunServeHandler} from 'trpc-bun-adapter'
import plugin from "bun-plugin-tailwind"
import { restartConfig } from "../restart.config"
import ZodTypeAny from "zod"
import { registry } from "../shared/trpcRegistry"
import "../shared/functions"
import { reactCompilerPlugin } from "../plugins/reactCompilerPlugin"

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

  if (!isStaticMode) {
    console.log("Building client...")
    try{
      await Bun.build({
        entrypoints: ['./app/entrypoint.tsx'],
        outdir: './dist',
        plugins: restartConfig.reactCompiler?.useReactCompiler ? [plugin, reactCompilerPlugin()] : [plugin],
        target: 'browser',
        format: 'esm',
        minify: !isDevMode,
        define: {
          'process.env.NODE_ENV': JSON.stringify(isDevMode ? 'development' : 'production'),
        },
      })
      console.log("Client builded")
    } catch (e) {
      console.error("Building error:", e)
      process.exit(1)
    }
  } else {
    console.log("Static mode: skipping client build")
  }

  const server = serve({
    port: restartConfig.port,
    development: isDevMode,
    async fetch(this: Server, req: Request, server: Server): Promise<Response> {
      const path = new URL(req.url).pathname
      
      if (!isStaticMode && path.startsWith(restartConfig.trpcEndpoint)) {
        const trpcResponse = await trpcHandler!.fetch(req, server)
        return trpcResponse ?? new Response("Not found (404)", { status: 404 })
      }

      if (path === "/") {
        try {
          if (isStaticMode) {
            const html = file("dist/index.html")
            return new Response(html, {
              headers: {
                "Content-Type": "text/html",
              }
            })
          }
          const { Body } = await import("app/App")
          const stream = await renderToReadableStream(<Body/>, {})
          return new Response(stream, {
            headers: { 
              "Content-Type": "text/html",
              "Cache-Control": isDevMode ? "no-cache" : "public, max-age=0"
            },
          })
        } catch (e) {
          console.error("SSR error:", e)
          return new Response("Server Error (500)", { status: 500 })
        }
      }

      if (path.endsWith(".html")) {
        const Filepath = path.split("/").pop()
        const publicFile = file("dist/" + Filepath)
        return new Response(publicFile, {
          headers: { "Content-Type": "text/html"}
        })
      }
      
      if (path.endsWith(".txt")) {
        const Filepath = path.split("/").pop()
        const publicFile = file("public/" + Filepath)
        return new Response(publicFile, {
          headers: { "Content-Type": "text/plain"}
        })
      }

      if (path.endsWith(".css")) {
        const Filepath = path.split("/").pop()
        const publicFile = file("dist/" + Filepath)
        return new Response(publicFile, {
          headers: { "Content-Type": "text/css"}
        })
      }

      if (path.endsWith(".svg")) {
        const Filepath = path.split("/").pop()
        const publicFile = file("public/" + Filepath)
        return new Response(publicFile, {
          headers: { "Content-Type": "image/svg+xml"}
        })
      }

      if (path.endsWith(".js")) {
        const Filepath = path.split("/").pop()
        const publicFile = file("dist/" + Filepath)
        return new Response(publicFile, {
          headers: { "Content-Type": "application/javascript"}
        })
      }

      return new Response("Page not found (404)", { status: 404 })
    },
    websocket: {
      message: () => {
        console.log("websocket message")
      }
    }
  })

  console.log(`✅ Web server online on ${server.url}`)
}