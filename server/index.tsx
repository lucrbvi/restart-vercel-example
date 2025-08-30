/**
 * This server is used as a *dev* server.
 * You can also use it as a production server like a good old consistant server.
 */

import { serve, file } from "bun"
import pathLib from "path"
import type { Server } from "bun"
import type { BunFile } from "bun"
import { publicProcedure, router } from './trpc'
import {createBunServeHandler} from 'trpc-bun-adapter'
import { restartConfig } from "../restart.config"
import ZodTypeAny from "zod"
import { registry } from "../shared/trpcRegistry"
import { build, buildCss } from "../build"
import { middlewares, type MiddlewareContext } from "./middlewares"
import { renderToReadableStream } from "react-dom/server"

function getContentType(ext: string): string {
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.txt': 'text/plain',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.xml': 'application/xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav'
  }
  return contentTypes[ext] || 'application/octet-stream'
}

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

if (!import.meta.main) {
  throw new Error("This file must be executed directly with Bun (ex: `bun server/index.tsx`)");
}

const argv = Bun.argv.slice(2)
const isStaticMode = argv.includes("--static")
const isDevMode = argv.includes("--dev")
const mode = isStaticMode ? "static" : (isDevMode ? "dev" : "prod")

if (!isDevMode && restartConfig.useReactScan) {
  restartConfig.useReactScan = false
}

// Ensure environment hints for libraries that read NODE_ENV
try {
  if (isDevMode) {
    process.env.NODE_ENV = "development"
  } else {
    process.env.NODE_ENV = "production"
  }
} catch {}

console.log(`Starting server in ${mode} mode`)

try {
  await import("@/server/index")
} catch (e) {
  console.warn("Warning: could not preload server functions:", e)
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
    try {
      await build()
      await buildCss(true)
    } catch (e) {
      console.error("Build error:", e)
    }
  } else {
    console.log("Building client...")
    try{
      await build()
      await buildCss(false)
      console.log("Client built")
    } catch (e) {
      console.error("Building error:", e)
      process.exit(1)
    }
  }
}

export const server = function(){return serve({
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

      // Handle server actions
      if (!isStaticMode && path === '/__server_actions') {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405 })
        }
        
        try {
          const { action, args } = await req.json()
          const { getServerAction } = await import("../shared/serverFunction")
          
          const impl = getServerAction(action)
          if (!impl) {
            return new Response(
              JSON.stringify({ error: `Server action ${action} not found` }),
              { 
                status: 404,
                headers: { 'Content-Type': 'application/json' }
              }
            )
          }
          
          const result = await impl(...args)
          return new Response(
            JSON.stringify({ data: result }),
            { 
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          )
        } catch (error) {
          console.error('Server action error:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { 
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            }
          )
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

      if (path !== "/" && !path.startsWith(restartConfig.trpcEndpoint) && !path.startsWith("/__server_actions")) {
        const cwd = process.cwd()
        
        const searchPaths = [
          pathLib.join(cwd, "dist", "public", path),
          pathLib.join(cwd, "public", path),
          pathLib.join(cwd, "dist", path),
          pathLib.join(cwd, path)
        ]
        
        let staticFile: BunFile | null = null
        
        for (const filePath of searchPaths) {
          try {
            const file = Bun.file(filePath)
            if (file.size > 0) {
              staticFile = file
              break
            }
          } catch {}
        }
        
        if (staticFile) {
          const ext = pathLib.extname(path).toLowerCase()
          const contentType = getContentType(ext)
          
          let res = new Response(staticFile, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": isDevMode ? "no-cache" : "public, max-age=3600"
            }
          })
          
          for (const m of middlewares) {
            if (m.onResponse) {
              res = await m.onResponse(ctx, res)
            }
          }
          return res
        }
      }

      // check available routes from app/routes
      function computeKnownRoutes(): string[] {
        const cwd = process.cwd().replace(/\\/g, "/")
        const result: string[] = []
        
        // Scan for both files and directories
        const fileGlob = new Bun.Glob(cwd + "/app/routes/**/*.tsx")
        const dirGlob = new Bun.Glob(cwd + "/app/routes/**/")
        
        // Process files
        for (const match of fileGlob.scanSync({ cwd })) {
          const abs = match.startsWith("/") ? match : pathLib.resolve(cwd, match)
          const rel = abs.replace(/\\/g, "/").replace(cwd + "/app/routes", "")
          let route = rel.replace(/\.tsx$/, "")
          if (route === "/index") route = "/"
          else if (route.endsWith("/index")) route = route.slice(0, -("/index".length))
          result.push(route)
        }
        
        // Process directories (check for index.tsx)
        for (const match of dirGlob.scanSync({ cwd })) {
          const abs = match.startsWith("/") ? match : pathLib.resolve(cwd, match)
          const rel = abs.replace(/\\/g, "/").replace(cwd + "/app/routes", "")
          
          // Check if directory has index.tsx
          const indexPath = abs + "/index.tsx"
          if (Bun.file(indexPath).size > 0) {
            let route = rel
            if (route === "/") route = "/"
            else if (route.endsWith("/")) route = route.slice(0, -1)
            result.push(route)
          }
        }
        
        return Array.from(new Set(result)).sort((a, b) => b.length - a.length)
      }

      const knownRoutes = isDevMode ? computeKnownRoutes() : (globalThis as any).__KNOWN_ROUTES__ ?? ((globalThis as any).__KNOWN_ROUTES__ = computeKnownRoutes())
      const isKnownClientRoute = knownRoutes.includes(path)

      if (path === "/" || isKnownClientRoute) {
        try {
          if (isStaticMode) {
            // In static mode, still generate content per route for RSC
            if (restartConfig.useReactServerComponents) {
              const routeName = path.slice(1) || "index"
              
              // Try to import as a file first, then as a directory with index.js
              let routeModule
              try {
                routeModule = await import(`../dist/routes/${routeName}.js`)
              } catch {
                // If file doesn't exist, try as directory with index.js
                routeModule = await import(`../dist/routes/${routeName}/index.js`)
              }
              
              const { default: PageComponent } = routeModule
              const { Body } = await import("app/App")
              
              const stream = await renderToReadableStream(
                <Body><PageComponent /></Body>
                , {
                onError(error) {
                  console.error("RSC static rendering error:", error)
                }
              })
              try {
                await (stream as any).allReady
              } catch {}
              let res = new Response(stream, {
                headers: {
                  "Content-Type": "text/html",
                  "Cache-Control": "public, max-age=3600"
                },
              })
              for (const m of middlewares) {
                if (m.onResponse) {
                  res = await m.onResponse(ctx, res)
                }
              }
              return res
            } else {
              // Traditional static mode - serve index.html for all routes
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
          }
          
          (globalThis as any).__SSR_PATH__ = path
          const { Body, App } = await import("app/App")
          
          if (restartConfig.useReactServerComponents) {
            try {
              const routeName = path.slice(1) || "index"
              await build()
              
              // Try to import as a file first, then as a directory with index.js
              let routeModule
              try {
                routeModule = await import(`../dist/routes/${routeName}.js`)
              } catch {
                // If file doesn't exist, try as directory with index.js
                routeModule = await import(`../dist/routes/${routeName}/index.js`)
              }
              
              const { default: PageComponent } = routeModule
              
              // Register any server actions from this route
              const { registerServerAction } = await import("../shared/serverFunction")
              if (routeModule.serverGreeting) {
                registerServerAction("serverGreeting", routeModule.serverGreeting)
              }
              const stream = await renderToReadableStream(
                <Body><PageComponent /></Body>
                , {
                onError(error) {
                  console.error("RSC streaming error:", error)
                }
              })
              try {
                await (stream as any).allReady
              } catch {}
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
              console.error("RSC rendering error:", e)
              // Fallback to normal SSR
            }
          }
          
          const stream = await renderToReadableStream(<Body><App /></Body>, {
            onError(err) {
              console.error("React SSR onError (/):", err)
            }
          })
          try {
            await (stream as any).allReady
          } catch {}
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

      
      
    let res = new Response("Page not found (404)", { status: 404 })
    for (const m of middlewares) {
      if (m.onResponse) {
        res = await m.onResponse(ctx, res)
      }
    }
    return res
      
  }
})}

console.log(`✅ Web server online on ${server().url}`)