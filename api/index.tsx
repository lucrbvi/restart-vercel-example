import { restartConfig as originalRestartConfig } from "../restart.config"
import { createAppRouter } from "../server/index"
import { createBunServeHandler } from 'trpc-bun-adapter'
import { middlewares, type MiddlewareContext } from "../server/middlewares"
import { renderToReadableStream } from "react-dom/server"
import pathLib from "path"

const restartConfig = {
  ...originalRestartConfig,
  useReactScan: false
}

// tRPC handler for serverless
const trpcHandler = createBunServeHandler({
  router: createAppRouter(),
  endpoint: restartConfig.trpcEndpoint,
  responseMeta() {
    return {
      status: 200,
      headers: {}
    }
  },
})

// Compute known routes (simplified for serverless)
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

// Main serverless handler
export default async function handler(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname
  const ctx: MiddlewareContext = {
    req,
    server: null as any, // Not available in serverless
    path,
    isDevMode: false,
    isStaticMode: false,
    state: {},
  }

  // Apply middlewares
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
  if (path === '/__server_actions') {
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
  
  // Handle tRPC requests
  if (path.startsWith(restartConfig.trpcEndpoint)) {
    const trpcResponse = await trpcHandler.fetch(req, null as any)
    const res = trpcResponse ?? new Response("Not found (404)", { status: 404 })
    let finalRes = res
    for (const m of middlewares) {
      if (m.onResponse) {
        finalRes = await m.onResponse(ctx, finalRes)
      }
    }
    return finalRes
  }

  // Handle static assets
  if (path.startsWith('/dist/') || path.startsWith('/public/')) {
    const filePath = path.startsWith('/dist/') ? path.slice(5) : path.slice(8)
    const file = Bun.file(filePath)
    if (file.size > 0) {
      return new Response(file)
    }
  }

  // Handle client routes
  const knownRoutes = computeKnownRoutes()
  const isKnownClientRoute = knownRoutes.includes(path)

  if (path === "/" || isKnownClientRoute) {
    try {
      const { Body, App } = await import("../app/App")
      
      if (restartConfig.useReactServerComponents) {
        try {
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
          
          const stream = await renderToReadableStream(
            <Body><PageComponent /></Body>,
            {
              onError(error) {
                console.error("RSC rendering error:", error)
              }
            }
          )
          
          try {
            await (stream as any).allReady
          } catch {}
          
          let res = new Response(stream, {
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
        } catch (error) {
          console.error("RSC error:", error)
          // Fallback to full app render
        }
      }
      
      // Fallback: render full app
      const stream = await renderToReadableStream(
        <Body><App /></Body>,
        {
          onError(error) {
            console.error("SSR rendering error:", error)
          }
        }
      )
      
      try {
        await (stream as any).allReady
      } catch {}
      
      let res = new Response(stream, {
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
    } catch (error) {
      console.error("SSR error:", error)
      return new Response("Internal Server Error", { status: 500 })
    }
  }

  // 404 for unknown routes
  return new Response("Not found (404)", { status: 404 })
}
