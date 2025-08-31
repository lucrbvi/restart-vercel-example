import { serve} from "bun"
import type { Server } from "bun"
import { publicProcedure, router } from './trpc'
import { restartConfig } from "../restart.config"
import { registry } from "../shared/trpcRegistry"
import { build, buildCss } from "../build"
import fetchHandler from "./handler.tsx"

// tRPC section

type Kind = "query" | "mutation"
type Entry = { name: string; kind: Kind; input: any; resolve: (opts: { input: any }) => any }

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
  throw new Error(
    "This file is for direct execution only (e.g., `bun run dev`)"
  );
}

const argv = Bun.argv.slice(2)
const isStaticMode = argv.includes("--static")
const isDevMode = argv.includes("--dev")
const mode = isStaticMode ? "static" : (isDevMode ? "dev" : "prod")

if (!isDevMode && restartConfig.useReactScan) {
  restartConfig.useReactScan = false
}

if (isDevMode) {
  process.env.NODE_ENV = "development"
} else {
  process.env.NODE_ENV = "production"
}

console.log(`Starting server in ${mode} mode`)

try {
  await import("@/server/index")
} catch (e) {
  console.warn("Warning: could not preload server functions:", e)
}

if (isStaticMode) {
  process.env.NODE_ENV = "development";
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
    process.env.NODE_ENV = "production";
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

export function server(): Server {
  return serve({
    port: restartConfig.port,
    development: isDevMode,
    fetch: fetchHandler,
  });
};

const serveInstance = server();

console.log(`✅ Web server online on ${serveInstance.url}`)