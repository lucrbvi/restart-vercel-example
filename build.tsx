import plugin from "bun-plugin-tailwind"
import { file, write } from "bun"
import { Body } from "server/index"
import { renderToString } from 'react-dom/server'

const entrypointPath = "./app/entrypoint.tsx" // change this if you want to make your own entrypoint script
const outdirPath = "./dist"
const entrypoint = file(entrypointPath)

// produce the client bundle
if (await entrypoint.exists()) {
  await Bun.build({
    entrypoints: [entrypointPath],
    outdir: outdirPath,
    plugins: [plugin],
    target: 'browser',
    format: 'esm',
    minify: true,
  })

  const htmlString = renderToString(<Body />)
  await write(outdirPath + "/index.html", htmlString)
}