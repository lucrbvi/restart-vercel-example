/**
 * This plugin transforms calls to client components (marked with "use client") 
 * into div tags with restart-react-client-component attribute
 */

import type { BunPlugin } from "bun"
import * as babel from "@babel/core"

const getBasename = (filePath: string, ext?: string) => {
  const parts = filePath.split('/')
  const filename = parts[parts.length - 1]
  if (!filename) {
    return ''
  }
  if (ext && filename.endsWith(ext)) {
    return filename.slice(0, -ext.length)
  }
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex === -1 ? filename : filename.slice(0, dotIndex)
}
import { restartConfig } from "../restart.config"

function reactServerComponentPluginFn(mode: 'server' | 'client'): BunPlugin {
  const clientComponents = new Set<string>()
  const clientComponentFileMap = new Map<string, string>()
  const computeRouteFileKey = (absPath: string) => {
    const normalized = absPath.replace(/\\/g, "/")
    const marker = "/app/routes/"
    const idx = normalized.indexOf(marker)
    if (idx === -1) return getBasename(absPath)
    const rel = normalized.slice(idx + marker.length)
    return rel.replace(/\.(tsx|jsx)$/, "")
  }
  
  const scanForClientComponents = async () => {
    const glob = new Bun.Glob("./app/routes/**/*.{tsx,jsx}")
    for (const file of glob.scanSync()) {
      const source = await Bun.file(file).text()
      // Only consider file-level directive at top
      const lines = source.split('\n')
      let firstMeaningful: string | null = null
      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue
        if (line.startsWith('//')) continue
        firstMeaningful = line
        break
      }
      if (firstMeaningful === '"use client"' || firstMeaningful === "'use client'") {
        const componentName = getBasename(file)
        clientComponents.add(componentName)
        clientComponentFileMap.set(componentName, computeRouteFileKey(file))
      }
    }
  }

  return {
    name: "bun-plugin-react-server-component",
    setup(builder) {
      scanForClientComponents().catch(console.error)
      
      builder.onLoad({ filter: /\.(jsx|tsx)$/ }, async (args) => {
        const isAppFile = /[\\/]app[\\/]/.test(args.path)
        const isNodeModules = /[\\/]node_modules[\\/]/.test(args.path)
        const isDist = /[\\/]dist[\\/]/.test(args.path)
        if (!isAppFile || isNodeModules || isDist) {
          return
        }
        
        const source = await Bun.file(args.path).text()
        
        if (/[\\/]app[\\/]routes[\\/]/.test(args.path)) {
          const componentName = getBasename(args.path)
          // Capture file-level directive and map
          const lines = source.split('\n')
          let firstMeaningful: string | null = null
          for (const raw of lines) {
            const line = raw.trim()
            if (!line) continue
            if (line.startsWith('//')) continue
            firstMeaningful = line
            break
          }
          if (firstMeaningful === '"use client"' || firstMeaningful === "'use client'") {
            clientComponents.add(componentName)
            clientComponentFileMap.set(componentName, computeRouteFileKey(args.path))
          }
        }
        
        if (!restartConfig.useReactServerComponents || isNodeModules || isDist) {
          return
        }
        
        const isEntrypoint = /[\\/]entrypoint\.tsx$/.test(args.path)
        const isRoute = /[\\/]routes[\\/]/.test(args.path)
        
        const localClientComponents = new Set<string>()

        const transformClientCalls = ({ types: t }: typeof babel) => {
          return {
            name: "transform-client-calls",
            visitor: {
              Program: {
                enter(path: any) {
                  // Collect local client components via AST (functions and arrow functions)
                  path.traverse({
                    FunctionDeclaration(innerPath: any) {
                      try {
                        const id = innerPath.node.id?.name
                        const body = innerPath.node.body
                        const hasDirective = (body?.directives && body.directives.some((d: any) => d.value?.value === 'use client'))
                          || (Array.isArray(body?.body) && body.body[0]
                            && t.isExpressionStatement(body.body[0])
                            && t.isStringLiteral(body.body[0].expression)
                            && body.body[0].expression.value === 'use client')
                        if (id && hasDirective) {
                          localClientComponents.add(id)
                        }
                      } catch {}
                    },
                    VariableDeclarator(innerPath: any) {
                      try {
                        const id = innerPath.node.id
                        if (!t.isIdentifier(id)) return
                        const init = innerPath.node.init
                        if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
                          const body = init.body
                          let hasDirective = false
                          if (t.isBlockStatement(body)) {
                            // @ts-ignore - fuck this error
                            hasDirective = (body.directives && body.directives.some((d: any) => d.value?.value === 'use client'))
                              || (Array.isArray(body.body) && body.body[0]
                                && t.isExpressionStatement(body.body[0])
                                && t.isStringLiteral(body.body[0].expression)
                                && body.body[0].expression.value === 'use client')
                          }
                          if (hasDirective) {
                            localClientComponents.add(id.name)
                          }
                        }
                      } catch {}
                    }
                  })
                },
                exit(path: any) {
                  const shouldAddExports = mode === 'client'
                  if (!shouldAddExports) return
                  if (!isEntrypoint && localClientComponents.size > 0) {
                    localClientComponents.forEach((componentName: string) => {
                      const exportStatement = t.exportNamedDeclaration(null, [
                        t.exportSpecifier(t.identifier(componentName), t.identifier(componentName))
                      ])
                      path.pushContainer('body', exportStatement)
                    })
                  }
                }
              },
              JSXElement(path: any) {
                // Only replace with slots in server build
                const transformJSXToSlots = mode === 'server'
                if (!transformJSXToSlots) return
                const openingElement = path.node.openingElement
                if (!t.isJSXIdentifier(openingElement.name)) return
                const componentName = openingElement.name.name
                if (clientComponents.has(componentName) || localClientComponents.has(componentName)) {
                  let componentId: string
                  if (localClientComponents.has(componentName)) {
                    const fileKey = computeRouteFileKey(args.path)
                    componentId = `${fileKey}:${componentName}`
                  } else {
                    const mapped = clientComponentFileMap.get(componentName)
                    componentId = mapped ? `${mapped}:${componentName}` : componentName
                  }
                  const divElement = t.jsxElement(
                    t.jsxOpeningElement(
                      t.jsxIdentifier('div'),
                      [
                        t.jsxAttribute(
                          t.jsxIdentifier('restart-react-client-component'),
                          t.stringLiteral(componentId)
                        )
                      ]
                    ),
                    t.jsxClosingElement(t.jsxIdentifier('div')),
                    path.node.children.length > 0
                      ? path.node.children
                      : [t.jsxElement(
                          t.jsxOpeningElement(t.jsxIdentifier('div'), []),
                          t.jsxClosingElement(t.jsxIdentifier('div')),
                          [t.jsxText(`Loading ${componentName}...`)]
                        )]
                  )
                  path.replaceWith(divElement)
                }
              },
              
              // Remove client component definitions from server code
              FunctionDeclaration(path: any) {
                const removeDefinitions = mode === 'server'
                if (removeDefinitions && localClientComponents.has(path.node.id?.name)) {
                  path.remove()
                }
              },
              
              VariableDeclaration(path: any) {
                const removeDefinitions = mode === 'server'
                if (!removeDefinitions) return
                path.node.declarations.forEach((declaration: any, index: number) => {
                  if (declaration.id?.name && localClientComponents.has(declaration.id.name)) {
                    if (path.node.declarations.length === 1) {
                      path.remove()
                    } else {
                      path.node.declarations.splice(index, 1)
                    }
                  }
                })
              }
            }
          }
        }

        const plugins: any[] = [transformClientCalls as any]
        
        // Apply React Compiler only to client-side code (entrypoint.tsx)
        // Avoid applying it to server components as it generates hooks incompatible with SSR
        if (restartConfig.reactCompiler?.useReactCompiler && 
            args.path.includes("/entrypoint.tsx")) {
          plugins.push(["babel-plugin-react-compiler", {
              ...restartConfig.reactCompiler?.reactCompilerConfig ?? {}
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
        
        return {
          contents: result.code,
          loader: args.path.endsWith(".tsx") ? "tsx" : "jsx",
        }
      })
    }
  }
}

export const reactServerComponentPluginServer = reactServerComponentPluginFn('server')
export const reactServerComponentPluginClient = reactServerComponentPluginFn('client')