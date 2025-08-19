import type { BunPlugin } from "bun"
import * as babel from "@babel/core"
import { restartConfig } from "../restart.config"

function reactCompilerPluginFn(): BunPlugin {
  return {
    name: "bun-plugin-react-compiler",
    setup(builder) {
      builder.onLoad({ filter: /\.(jsx|tsx)$/ }, async (args) => {
        if (!args.path.includes("/app/") || args.path.includes("/node_modules/") || args.path.includes("/dist/")) {
          return
        }
        const source = await Bun.file(args.path).text()
        const result = await babel.transformAsync(source, {
          filename: args.path,
          plugins: [
            ["babel-plugin-react-compiler", {
                ...restartConfig.reactCompiler?.useReactCompiler ? restartConfig?.reactCompiler?.reactCompilerConfig : {}
            }]
          ],
          parserOpts: { plugins: ["jsx", "typescript"] },
          sourceMaps: false,
          babelrc: false,
          configFile: false,
        })
        if (!result?.code) return
        return {
          contents: result.code,
          loader: args.path.endsWith(".tsx") ? "tsx" : "jsx",
        }
      })
    }
  }
}

export const reactCompilerPlugin = reactCompilerPluginFn()