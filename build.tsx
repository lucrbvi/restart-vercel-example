import plugin from "bun-plugin-tailwind"
import { reactCompilerPlugin } from "./plugins/reactCompilerPlugin"
import { restartSecurityPlugin } from "./plugins/restartSecurityPlugin"
import { file, write } from "bun"
import { renderToString } from 'react-dom/server'
import { restartConfig } from "./restart.config"

const entrypointPath = "./app/entrypoint.tsx" // change this if you want to make your own entrypoint script
const outdirPath = "./dist"
const entrypoint = file(entrypointPath)

export async function build() {
  await Bun.build({
    entrypoints: [entrypointPath],
    outdir: outdirPath,
    plugins: restartConfig.reactCompiler?.useReactCompiler
      ? [plugin, restartSecurityPlugin(), reactCompilerPlugin()]
      : [plugin, restartSecurityPlugin()],
    target: 'browser',
    format: 'esm',
    minify: true,
  })

  const { Body } = await import("app/App")
  const htmlString = renderToString(<Body />)
  await write(outdirPath + "/index.html", htmlString)
}

// produce the client bundle
if (await entrypoint.exists()) {
  await build()
} else {
  console.error("Entrypoint not found")
  process.exit(1)
}