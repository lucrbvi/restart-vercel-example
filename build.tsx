import tailwindPlugin from "bun-plugin-tailwind"
import { reactCompilerPlugin } from "./plugins/reactCompilerPlugin"
import { restartSecurityPlugin } from "./plugins/restartSecurityPlugin"
import { bunGlobPlugin } from "./plugins/bunGlobPlugin"
import { reactServerComponentPluginClient, reactServerComponentPluginServer } from "./plugins/reactServerComponentPlugin"


import { file, write } from "bun"
import { renderToString } from 'react-dom/server'
import { restartConfig } from "./restart.config"

const entrypointPath = "./app/entrypoint.tsx" // change this if you want to make your own entrypoint script
const outdirPath = "./dist"
const stylesPath = "./app/styles.css"
const entrypoint = file(entrypointPath)

export async function buildCss(dev: boolean = false) {
  Bun.spawn(["bunx", "@tailwindcss/cli", "-i", stylesPath, "-o", outdirPath + "/styles.css", dev ? "--watch" : "--minify"], {
    stdio: ["inherit", "ignore", "ignore"],
  })
}

export async function build() {
  try {
    await buildCss()
  } catch (e) {
    console.warn("CSS build failed:", e)
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

  const { Body } = await import("app/App")
  if (!restartConfig.useReactServerComponents) {
    const htmlString = renderToString(<Body />)
    await write(outdirPath + "/index.html", htmlString)
  }

  // Build server-side RSC route modules
  if (restartConfig.useReactServerComponents) {
    const cwd = process.cwd().replace(/\\/g, "/")
    const glob = new Bun.Glob(cwd + "/app/routes/**/*.tsx")
    const routeEntryPoints: string[] = []
    for (const match of glob.scanSync({ cwd })) {
      const abs = match.startsWith("/") ? match : `${cwd}/${match}`
      routeEntryPoints.push(abs)
    }
    if (routeEntryPoints.length > 0) {
      await Bun.build({
        entrypoints: routeEntryPoints,
        outdir: outdirPath + "/routes",
        plugins: [reactServerComponentPluginServer],
        target: 'bun',
        format: 'esm',
        minify: false,
        define: {
          "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
        },
      })
    }
  }
  return
}

// produce the client bundle
if (await entrypoint.exists()) {
  await build()
} else {
  console.error("Entrypoint not found")
  process.exit(1)
}