import tailwindPlugin from "bun-plugin-tailwind"
import { reactCompilerPlugin } from "./plugins/reactCompilerPlugin"
import { restartSecurityPlugin } from "./plugins/restartSecurityPlugin"
import { bunGlobPlugin } from "./plugins/bunGlobPlugin"
import { reactServerComponentPluginClient, reactServerComponentPluginServer } from "./plugins/reactServerComponentPlugin"

import { file, write } from "bun"
import { renderToString } from 'react-dom/server'
import { renderToReadableStream } from 'react-dom/server'
import { restartConfig as originalRestartConfig } from "./restart.config"
import path from "node:path"
import { existsSync } from "node:fs"
import { mkdir, readdir, rm, cp } from "node:fs/promises";

const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV

// Disable react-scan during build for production
const restartConfig = {
  ...originalRestartConfig,
  useReactScan: process.env.NODE_ENV === "development" ? originalRestartConfig.useReactScan : false
}

const entrypointPath = "./app/entrypoint.tsx" // change this if you want to make your own entrypoint script
const outdirPath = "./dist"
const stylesPath = "./app/styles.css"
const entrypoint = file(entrypointPath)

export async function buildCss(dev: boolean = false) {
  Bun.spawn(["bunx", "@tailwindcss/cli", "-i", stylesPath, "-o", outdirPath + "/styles.css", dev ? "--watch" : "--minify"], {
    stdio: ["inherit", "ignore", "ignore"],
  })
}

async function copyDir(src: string, dest: string) {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else {
      await mkdir(path.dirname(d), { recursive: true });
      await cp(s, d);
    }
  }
}

export async function build() {
  try {
    await buildCss()
  } catch (e) {
    console.warn("CSS build failed:", e)
  }
  
  if (existsSync("./public")) {
    try {
      const files = await readdir("./public", { recursive: true })
      for (const file of files) {
        if (typeof file === 'string') {
          const sourcePath = `./public/${file}`
          const destPath = `./dist/${file}`
          
          const destDir = destPath.substring(0, destPath.lastIndexOf('/'))
          if (!existsSync(destDir)) {
            await mkdir(destDir, { recursive: true })
          }
          
          await Bun.write(destPath, await Bun.file(sourcePath).arrayBuffer())
        }
      }
    } catch (e) {
      console.warn("Failed to copy public files:", e)
    }
  }
  
  await Bun.build({
    entrypoints: [entrypointPath],
    outdir: outdirPath,
    plugins: restartConfig.reactCompiler?.useReactCompiler
      ? [tailwindPlugin, bunGlobPlugin, restartSecurityPlugin, reactServerComponentPluginClient, reactCompilerPlugin]
      : [tailwindPlugin, bunGlobPlugin, restartSecurityPlugin, reactServerComponentPluginClient],
    target: 'browser',
    format: 'esm',
    minify: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
    },
  })

  const { Body, BodySync, App } = await import("app/App")
  
  // Always generate index.html, but with different content based on RSC mode
  if (restartConfig.useReactServerComponents) {
    // For RSC mode, use renderToReadableStream to handle async components
    const stream = await renderToReadableStream(<Body><App /></Body>)
    await (stream as any).allReady
    const chunks: string[] = []
    const reader = stream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(new TextDecoder().decode(value))
    }
    const htmlString = chunks.join('')
    await write(outdirPath + "/index.html", htmlString)
  } else {
    // For traditional SSR mode, render the full app
    const htmlString = renderToString(<Body><App /></Body>)
    await write(outdirPath + "/index.html", htmlString)
  }

  // Build server-side RSC route modules
  if (restartConfig.useReactServerComponents) {
    const cwd = process.cwd().replace(/\\/g, "/")
    const glob = new Bun.Glob(cwd + "/app/routes/**/*.tsx")
    const routeEntryPoints: string[] = []
    const routeManifest: Record<string, string> = {}
    
    for (const match of glob.scanSync({ cwd })) {
      const abs = match.startsWith("/") ? match : `${cwd}/${match}`
      routeEntryPoints.push(abs)
      
      const relativePath = match.replace(cwd + "/app/routes/", '').replace(/\.tsx$/, '')
      const distPath = `./routes/${relativePath}.js`
      routeManifest[relativePath] = distPath
    }
    
    if (routeEntryPoints.length > 0) {
      await Bun.build({
        entrypoints: routeEntryPoints,
        outdir: outdirPath + "/routes",
        plugins: [reactServerComponentPluginServer],
        target: 'bun',
        format: 'esm',
        minify: true,
        packages: "bundle",
        define: {
          "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
        },
      })
      
      if (process.env.NODE_ENV === "production") {
        const manifestContent = `
export const routes = {
${Object.entries(routeManifest)
  .map(([routePath, distPath]) => `  "${routePath}": () => import("${distPath}"),`)
  .join('\n')}
};

export function getRoute(routePath) {
  return routes[routePath];
}
`
        await write(outdirPath + "/routes.manifest.js", manifestContent)
      }
    }
  }
  
  // Build server-side files (app/server/**/*.ts)
  const cwd = process.cwd().replace(/\\/g, "/")
  const serverGlob = new Bun.Glob(cwd + "/app/server/**/*.{ts,tsx}")
  const serverEntryPoints: string[] = []
  for (const match of serverGlob.scanSync({ cwd })) {
    const abs = match.startsWith("/") ? match : `${cwd}/${match}`
    serverEntryPoints.push(abs)
  }
  if (serverEntryPoints.length > 0) {
    await Bun.build({
      entrypoints: serverEntryPoints,
      outdir: outdirPath + "/server",
      plugins: [reactServerComponentPluginServer],
      target: 'bun',
      format: 'esm',
      minify: true,
      packages: "bundle",
      define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
      },
    })
  }

  await Bun.build({
    entrypoints: ["./server/handler.tsx"],
    outdir: outdirPath + "/api",
    target: "bun",
    format: "esm",
    minify: true,
    packages: "bundle",
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        process.env.NODE_ENV || "production"
      ),
    },
  });
}

// produce the client bundle
if (await entrypoint.exists()) {
  await build()
} else {
  console.error("Entrypoint not found")
  process.exit(1)
}