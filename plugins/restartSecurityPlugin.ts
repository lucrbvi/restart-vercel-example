import type { BunPlugin } from "bun"
import * as babel from "@babel/core"
import path from "path"
import { restartConfig as buildRestartConfig } from "../restart.config"

/**
 * This plugin removes server-only implementation details from client bundle by
 * transforming `serverFunction(name, kind, schema, resolve)` calls into
 * lightweight client stubs that call tRPC (`trpc[name][kind](arg)`).
 * It also removes middleware-related stuff.
 */
function restartSecurityPluginFn(): BunPlugin {
  return {
    name: "restart-security-plugin",
    setup(builder) {
      builder.onLoad({ filter: /\.(ts|tsx|js|jsx)$/ }, async (args) => {
        if (args.path.includes("/node_modules/") || args.path.includes("/dist/")) {
          return
        }

        const source = await Bun.file(args.path).text()

        let middlewares: boolean = false
        const usesConfig: boolean = source.includes("restart.config")

        if (!source.includes("serverFunction") && !source.includes("newMiddleware") && !source.includes("middlewares") && !usesConfig) {
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
                let configTouched = false
                const configLocalNames: string[] = []

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
                  // Inline restart.config imports into constants
                  if (src && /(^|\/)restart\.config(\.(t|j)sx?)?$/.test(src)) {
                    // collect local names
                    for (const s of p.node.specifiers) {
                      if (t.isImportSpecifier(s)) {
                        if (t.isIdentifier(s.imported) && s.imported.name === "restartConfig") {
                          configLocalNames.push(s.local.name)
                        }
                      } else if (t.isImportDefaultSpecifier(s) || t.isImportNamespaceSpecifier(s)) {
                        configLocalNames.push(s.local.name)
                      }
                    }
                    p.remove()
                  }
                })
                
                if (serverFunctionLocalNames.size === 0 && !middlewares && configLocalNames.length === 0) {
                  return
                }

                // Helper to convert JS values to Babel AST literals
                function literalFrom(value: any): any {
                  if (value === null) return t.nullLiteral()
                  if (typeof value === "string") return t.stringLiteral(value)
                  if (typeof value === "number") return t.numericLiteral(value)
                  if (typeof value === "boolean") return t.booleanLiteral(value)
                  if (Array.isArray(value)) {
                    return t.arrayExpression(value.map((v) => literalFrom(v)))
                  }
                  if (typeof value === "object") {
                    const props = Object.entries(value).map(([k, v]) =>
                      t.objectProperty(t.identifier(k), literalFrom(v))
                    )
                    return t.objectExpression(props)
                  }
                  // fallback: string
                  return t.stringLiteral(String(value))
                }
                
                function getAtPath(obj: any, keys: (string | number)[]) {
                  let cur = obj
                  for (const k of keys) {
                    if (cur == null) return undefined
                    cur = (cur as any)[k as any]
                  }
                  return cur
                }

                programPath.traverse({
                  MemberExpression(memberPath: any) {
                    // Inline restartConfig.xxx → literal
                    let base = memberPath.node as any
                    const keys: (string | number)[] = []
                    // Build full chain a.b.c
                    while (base && (base.type === "MemberExpression" || base.type === "OptionalMemberExpression")) {
                      const prop: any = base.property
                      if (base.computed) {
                        if (prop && (prop.type === "StringLiteral" || prop.type === "NumericLiteral")) {
                          keys.unshift(prop.value)
                        } else {
                          return
                        }
                      } else {
                        if (prop && prop.type === "Identifier") {
                          keys.unshift(prop.name)
                        } else {
                          return
                        }
                      }
                      base = base.object
                    }
                    if (!base || base.type !== "Identifier") return
                    const baseName = base.name
                    if (!configLocalNames.includes(baseName)) return
                    const value = getAtPath(buildRestartConfig, keys)
                    if (value === undefined) return
                    memberPath.replaceWith(literalFrom(value))
                    configTouched = true

                    if (!middlewares) return
                    if (t.isIdentifier(memberPath.node.object) && memberPath.node.object.name === "middlewares") {
                      const parent = memberPath.parent
                      if (t.isCallExpression(parent) || t.isExpressionStatement(parent)) {
                        memberPath.getFunctionParent()?.remove() || memberPath.getStatementParent()?.remove()
                      }
                    }
                  },
                  OptionalMemberExpression(omePath: any) {
                    // Treat same as MemberExpression
                    let base = omePath.node as any
                    const keys: (string | number)[] = []
                    while (base && (base.type === "MemberExpression" || base.type === "OptionalMemberExpression")) {
                      const prop: any = base.property
                      if (base.computed) {
                        if (prop && (prop.type === "StringLiteral" || prop.type === "NumericLiteral")) {
                          keys.unshift(prop.value)
                        } else {
                          return
                        }
                      } else {
                        if (prop && prop.type === "Identifier") {
                          keys.unshift(prop.name)
                        } else {
                          return
                        }
                      }
                      base = base.object
                    }
                    if (!base || base.type !== "Identifier") return
                    const baseName = base.name
                    if (!configLocalNames.includes(baseName)) return
                    const value = getAtPath(buildRestartConfig, keys)
                    if (value === undefined) return
                    omePath.replaceWith(literalFrom(value))
                    configTouched = true
                  },
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
                })

                if (!transformedSomething && !configTouched && !middlewares) return

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
                if (transformedSomething && !hasTrpcImport) {
                  const trpcImport = t.importDeclaration(
                    [t.importSpecifier(t.identifier("trpc"), t.identifier("trpc"))],
                    t.stringLiteral(relToTrpc)
                  )
                  programPath.unshiftContainer("body", trpcImport)
                }

                if (transformedSomething) {
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
        }

        const plugins: any[] = [babelPlugin as any]
        // Chain React Compiler on files transformed by the security plugin
        // so they don't skip compilation due to short-circuiting other plugins.
        if (buildRestartConfig.reactCompiler?.useReactCompiler) {
          plugins.push(["babel-plugin-react-compiler", {
            ...(buildRestartConfig.reactCompiler?.reactCompilerConfig ?? {})
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

export const restartSecurityPlugin = restartSecurityPluginFn()