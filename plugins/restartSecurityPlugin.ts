import type { BunPlugin } from "bun"
import * as babel from "@babel/core"
import path from "path"

/**
 * This plugin removes server-only implementation details from client bundle by
 * transforming `serverFunction(name, kind, schema, resolve)` calls into
 * lightweight client stubs that call tRPC (`trpc[name][kind](arg)`).
 * It also removes middleware-related stuff.
 */
export function restartSecurityPlugin(): BunPlugin {
  return {
    name: "restart-security-plugin",
    setup(builder) {
      builder.onLoad({ filter: /\.(ts|tsx|js|jsx)$/ }, async (args) => {
        if (args.path.includes("/node_modules/") || args.path.includes("/dist/")) {
          return
        }

        const source = await Bun.file(args.path).text()

        let middlewares: boolean = false

        if (!source.includes("serverFunction") && !source.includes("newMiddleware") && !source.includes("middlewares")) {
          return
        }

        if (source.includes("newMiddleware") || source.includes("middlewares")) {
          middlewares = true
        }

        const fileDir = path.dirname(args.path)
        const trpcClientAbs = path.resolve(process.cwd(), "app/trpcClient.ts")
        let relToTrpc = path.relative(fileDir, trpcClientAbs).replace(/\\/g, "/")
        relToTrpc = relToTrpc.replace(/\.(t|j)sx?$/, "")
        if (!relToTrpc.startsWith(".")) relToTrpc = "./" + relToTrpc

        const babelPlugin = (core: typeof babel) => {
          const t = core.types
          return {
            name: "transform-serverFunction-to-trpc-stub",
            visitor: {
              Program(programPath: any) {
                const serverFunctionLocalNames = new Set<string>()
                let transformedSomething = false

                programPath.get("body").forEach((p: any) => {
                  if (!p.isImportDeclaration()) return
                  const srcNode: any = (p.node as any).source
                  const src: string | undefined = srcNode && typeof srcNode.value === "string" ? srcNode.value : undefined
                  if (src && /(^|\/)shared\/serverFunction$/.test(src)) {
                    const remaining = p.node.specifiers.filter((s: any) => {
                      if (t.isImportSpecifier(s) && t.isIdentifier(s.imported) && s.imported.name === "serverFunction") {
                        serverFunctionLocalNames.add(s.local.name)
                        return false
                      }
                      return true
                    })
                    if (remaining.length === 0) {
                      p.remove()
                    } else {
                      p.node.specifiers = remaining
                    }
                  }
                  if (middlewares && src && /(^|\/)server\/middlewares$/.test(src)) {
                    p.remove()
                  }
                })
                
                if (serverFunctionLocalNames.size === 0 && !middlewares) {
                  return
                }

                programPath.traverse({
                  CallExpression(callPath: any) {
                    const callee = callPath.get("callee")
                    if (!callee.isIdentifier()) return

                    if (middlewares && callee.isIdentifier() && callee.node.name === "newMiddleware") {
                      const stmt = callPath.getStatementParent?.()
                      if (stmt) {
                        stmt.remove()
                      } else {
                        callPath.remove()
                      }
                      return
                    }

                    if (!serverFunctionLocalNames.has(callee.node.name)) return

                    const args = callPath.get("arguments")
                    if (args.length < 4) return

                    const nameArg = args[0]
                    const kindArg = args[1]

                    if (!nameArg.isStringLiteral()) return
                    if (!kindArg.isStringLiteral()) return

                    const nameLiteral = nameArg.node.value
                    const kindLiteral = kindArg.node.value
                    const method = kindLiteral === "query" ? "query" : "mutate"

                    const fnParam = t.identifier("arg")
                    const trpcId = t.identifier("trpc")

                    const memberName = t.memberExpression(
                      trpcId,
                      t.stringLiteral(nameLiteral),
                      true
                    )
                    const memberMethod = t.memberExpression(
                      memberName,
                      t.identifier(method),
                      false
                    )
                    const call = t.callExpression(memberMethod, [fnParam])
                    const arrow = t.arrowFunctionExpression([fnParam], call)
                    callPath.replaceWith(arrow)
                    transformedSomething = true
                  },
                  MemberExpression(memberPath: any) {
                    if (!middlewares) return
                    if (t.isIdentifier(memberPath.node.object) && memberPath.node.object.name === "middlewares") {
                      const parent = memberPath.parent
                      if (t.isCallExpression(parent) || t.isExpressionStatement(parent)) {
                        memberPath.getFunctionParent()?.remove() || memberPath.getStatementParent()?.remove()
                      }
                    }
                  }
                })

                if (!transformedSomething) return

                let hasTrpcImport = false
                programPath.get("body").forEach((p: any) => {
                  if (p.isImportDeclaration()) {
                    const srcVal: string | undefined = p.node.source?.value
                    if (srcVal === relToTrpc) {
                      hasTrpcImport = true
                    }
                    if (middlewares && srcVal && /(^|\/)server\/middlewares$/.test(srcVal)) {
                      p.remove()
                      return
                    }
                  }
                  if (middlewares && p.isVariableDeclaration()) {
                    const filteredDeclarators = p.node.declarations.filter((declarator: any) => {
                      if (t.isVariableDeclarator(declarator) && t.isIdentifier(declarator.id)) {
                        const name = declarator.id.name
                        return !name.includes("middleware") && !name.includes("Middleware")
                      }
                      return true
                    })
                    if (filteredDeclarators.length === 0) {
                      p.remove()
                    } else {
                      p.node.declarations = filteredDeclarators
                    }
                  }
                  if (middlewares && p.isFunctionDeclaration() && p.node.id) {
                    const name = p.node.id.name
                    if (name.includes("middleware") || name.includes("Middleware") || name === "newMiddleware") {
                      p.remove()
                    }
                  }
                  if (middlewares && (p.isTSTypeAliasDeclaration() || p.isTSInterfaceDeclaration())) {
                    const name = p.node.id.name
                    if (name.includes("middleware") || name.includes("Middleware")) {
                      p.remove()
                    }
                  }
                })
                if (!hasTrpcImport) {
                  const trpcImport = t.importDeclaration(
                    [t.importSpecifier(t.identifier("trpc"), t.identifier("trpc"))],
                    t.stringLiteral(relToTrpc)
                  )
                  programPath.unshiftContainer("body", trpcImport)
                }

                programPath.get("body").forEach((p: any) => {
                  if (!p.isImportDeclaration()) return
                  const srcVal: string | undefined = (p.node as any).source?.value
                  if (srcVal === "zod") {
                    p.remove()
                  }
                })
              }
            }
          }
        }

        const result = await babel.transformAsync(source, {
          filename: args.path,
          plugins: [babelPlugin as any],
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