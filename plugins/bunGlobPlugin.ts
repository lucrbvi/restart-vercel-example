import type { BunPlugin } from "bun"
import * as babel from "@babel/core"
import path from "path"
import { restartConfig } from "../restart.config"

function bunGlobPluginFn(): BunPlugin {
  return {
    name: "bun-glob",
    setup(builder) {
      builder.onLoad({ filter: /\.(ts|tsx|js|jsx)$/ }, async (args) => {
        // Only transform source files, skip deps and outputs
        if (args.path.includes("/node_modules/") || args.path.includes("/dist/")) {
          return
        }

        const source = await Bun.file(args.path).text()

        // If file doesn't use import.meta.glob, let other plugins handle it (e.g., React Compiler)
        if (!source.includes("import.meta.glob") && !source.includes("import.meta[\"glob\"]") && !source.includes("import.meta['glob']")) {
          return
        }

        const fileDir = path.dirname(args.path)

        const plugin = ({ types: t }: typeof babel) => {
          return {
            name: "bun-glob",
            visitor: {
              CallExpression(p: any) {
                const callee = p.node.callee
                if (!callee || callee.type !== "MemberExpression") return
                const obj: any = callee.object
                const prop: any = callee.property
                // Match: import.meta.glob("...")
                const isImportMeta = obj && obj.type === "MetaProperty" && obj.meta?.name === "import" && obj.property?.name === "meta"
                const isGlob = prop && ((prop.type === "Identifier" && prop.name === "glob") || (prop.type === "StringLiteral" && prop.value === "glob"))
                if (!isImportMeta || !isGlob) return

                const argsNodes = p.node.arguments
                if (!argsNodes || argsNodes.length === 0) return
                const first = argsNodes[0]
                if (first.type !== "StringLiteral") return

                const rawPattern: string = first.value

                let fsPattern: string
                if (rawPattern.startsWith("./") || rawPattern.startsWith("../")) {
                  fsPattern = path.resolve(fileDir, rawPattern)
                } else {
                  fsPattern = path.resolve(process.cwd(), rawPattern)
                }

                const glob = new Bun.Glob(fsPattern.replace(/\\/g, "/"))
                const matches: string[] = []
                for (const match of glob.scanSync({ cwd: process.cwd() })) {
                  const abs = match.startsWith("/") ? match : path.resolve(process.cwd(), match)
                  matches.push(abs.replace(/\\/g, "/"))
                }

                const props = matches
                  .map((absPath) => {
                    const relToFile = path.relative(fileDir, absPath).replace(/\\/g, "/")
                    const spec = relToFile.startsWith(".") ? relToFile : "./" + relToFile
                    const key = t.stringLiteral(spec)
                    const importArg = t.stringLiteral(spec)
                    const importCall = t.callExpression(t.import(), [importArg])
                    const arrow = t.arrowFunctionExpression([], importCall)
                    return t.objectProperty(key, arrow)
                  })
                const replacement = t.objectExpression(props)
                p.replaceWith(replacement)
              }
            }
          }
        }

        const plugins: any[] = [plugin as any]
        if (restartConfig.reactCompiler?.useReactCompiler) {
          plugins.push(["babel-plugin-react-compiler", {
            ...(restartConfig.reactCompiler?.reactCompilerConfig ?? {})
          }])
        }

        const result = await babel.transformAsync(source, {
          filename: args.path,
          plugins,
          parserOpts: { plugins: ["jsx", "typescript"] },
          sourceMaps: false,
          babelrc: false,
          configFile: false,
        })

        if (!result?.code) return

        const ext = args.path.endsWith(".tsx")
          ? "tsx"
          : args.path.endsWith(".ts")
            ? "ts"
            : args.path.endsWith(".jsx")
              ? "jsx"
              : "js"

        return {
          contents: result.code,
          loader: ext as any,
        }
      })
    }
  }
}

export const bunGlobPlugin = bunGlobPluginFn()
