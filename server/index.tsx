// SERVER CODE

/**
 * This server is used as a *dev* server.
 * You can also use it as a production server like a good old consistant server.
 */

import { serve, file } from "bun"
import { renderToReadableStream } from "react-dom/server"
import { App } from "app/App"
import { publicProcedure, router } from './trpc'
import { z } from "zod"
import {createBunServeHandler} from 'trpc-bun-adapter'
import plugin from "bun-plugin-tailwind"

// tRPC section

const appRouter = router({
  getName: publicProcedure
    .input(z.string())
    .query(async (opts: any) => {
      const { input } = opts
      return `Hello ${input}`
    })
})

export type AppRouter = typeof appRouter

type ServerFunctionSchema = {
  name: string,
  input: any,
  query?: (...args: any[]) => any
  mutation?: any
}

export function serverFunction(json: ServerFunctionSchema) {

}

serverFunction({
  name: "a",
  input: z.string(),
  query: () => console.log("hi")
})

// server section

export function Body() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Restart</title>
        <link rel="stylesheet" href="/styles.css" />
        <link rel="icon" type="image/svg+xml" href="/react.svg"></link>
      </head>
      <body>
        <div id="root">
          <App />
        </div>
        <script
          type="module"
          src="/entrypoint.js"
          crossOrigin="anonymous"
        ></script>
      </body>
    </html>
  )
}

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
    console.log("Building client...")
    try{
      await Bun.build({
        entrypoints: ['./app/entrypoint.tsx'],
        outdir: './dist',
        plugins: [plugin],
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
    port: 3000,
    development: isDevMode,
    async fetch(req, res) {
      const path = new URL(req.url).pathname
      
      if (req.method === "OPTIONS" && path.startsWith("/trpc")) {
        return new Response(null, {
          status: 204,
        })
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
  })

  console.log(`✅ Web server online on ${server.url}`)

  if (!isStaticMode) {
    const trpcServer = serve({
        port: 3001,
        ...createBunServeHandler({
            router: appRouter,
            responseMeta() {
              return {
                status: 200,
                headers: {
                  "Access-Control-Allow-Origin": "http://localhost:3000",
                  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                  "Access-Control-Allow-Headers": "Content-Type",
                  "Access-Control-Allow-Credentials": "true",
                }
              }
            }
          }
        )
      },
    )

    console.log(`✅ tRPC server online on ${trpcServer.url}`)
  } else {
    console.log("Static mode: tRPC server disabled")
  }
}