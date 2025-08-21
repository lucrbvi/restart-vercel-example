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
        const localServerActions = new Set<string>()

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
                        const hasClientDirective = (body?.directives && body.directives.some((d: any) => d.value?.value === 'use client'))
                          || (Array.isArray(body?.body) && body.body[0]
                            && t.isExpressionStatement(body.body[0])
                            && t.isStringLiteral(body.body[0].expression)
                            && body.body[0].expression.value === 'use client')
                        const hasServerDirective = (body?.directives && body.directives.some((d: any) => d.value?.value === 'use server'))
                          || (Array.isArray(body?.body) && body.body[0]
                            && t.isExpressionStatement(body.body[0])
                            && t.isStringLiteral(body.body[0].expression)
                            && body.body[0].expression.value === 'use server')
                        if (id && hasClientDirective) {
                          localClientComponents.add(id)
                        }
                        if (id && hasServerDirective) {
                          localServerActions.add(id)
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
                          let hasClientDirective = false
                          let hasServerDirective = false
                          if (t.isBlockStatement(body)) {
                            // @ts-ignore - fuck this error
                            hasClientDirective = (body.directives && body.directives.some((d: any) => d.value?.value === 'use client'))
                              || (Array.isArray(body.body) && body.body[0]
                                && t.isExpressionStatement(body.body[0])
                                && t.isStringLiteral(body.body[0].expression)
                                && body.body[0].expression.value === 'use client')
                            hasServerDirective = (body.directives && body.directives.some((d: any) => d.value?.value === 'use server'))
                              || (Array.isArray(body.body) && body.body[0]
                                && t.isExpressionStatement(body.body[0])
                                && t.isStringLiteral(body.body[0].expression)
                                && body.body[0].expression.value === 'use server') || false
                          }
                          if (hasClientDirective) {
                            localClientComponents.add(id.name)
                          }
                          if (hasServerDirective) {
                            localServerActions.add(id.name)
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
                const openingElement = path.node.openingElement
                if (!t.isJSXIdentifier(openingElement.name)) return
                const componentName = openingElement.name.name
                
                if (mode === 'server') {
                  // Handle client components in server mode - but allow server actions inside to be pre-rendered
                  if (clientComponents.has(componentName) || localClientComponents.has(componentName)) {
                    // Check if this client component contains server actions that need server-side rendering
                    let hasServerActions = false
                    
                    // We need to analyze the component to see if it contains server actions
                    // For now, let's execute it server-side if it contains any server actions
                    if (localServerActions.size > 0) {
                      // Execute the client component server-side to extract server action results
                      hasServerActions = true
                    }
                    
                    if (!hasServerActions) {
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
                      return
                    }
                    // If it has server actions, let it render server-side and then client will hydrate over it
                  }
                  
                  // Handle server actions used as components (render them server-side)
                  if (localServerActions.has(componentName)) {
                    // Transform <ServerAction /> to {await ServerAction()}
                    const callExpression = t.awaitExpression(
                      t.callExpression(
                        t.identifier(componentName),
                        [] // No arguments for now, could be extended
                      )
                    )
                    const jsxExpressionContainer = t.jsxExpressionContainer(callExpression)
                    path.replaceWith(jsxExpressionContainer)
                    return
                  }
                }
                
                if (mode === 'client') {
                  // Remove server action JSX calls from client code
                  if (localServerActions.has(componentName)) {
                    // Replace with empty div or remove entirely
                    const emptyDiv = t.jsxElement(
                      t.jsxOpeningElement(t.jsxIdentifier('div'), []),
                      t.jsxClosingElement(t.jsxIdentifier('div')),
                      []
                    )
                    path.replaceWith(emptyDiv)
                    return
                  }
                }
              },
              
              // Transform server actions to serverFunction calls in server mode
              // Remove client component definitions from server code
              // Remove server action definitions from client code
              FunctionDeclaration(path: any) {
                const functionName = path.node.id?.name
                
                // Remove client components from server code
                if (mode === 'server' && localClientComponents.has(functionName)) {
                  path.remove()
                  return
                }
                
                // Remove server actions from client code  
                if (mode === 'client' && localServerActions.has(functionName)) {
                  path.remove()
                  return
                }
                
                // Transform server actions to use serverFunction
                if (mode === 'server' && localServerActions.has(functionName)) {
                  if (functionName) {
                    const params = path.node.params
                    const body = path.node.body
                    
                    // Remove "use server" directive from body
                    if (body.body && Array.isArray(body.body) && body.body[0] && 
                        t.isExpressionStatement(body.body[0]) && 
                        t.isStringLiteral(body.body[0].expression) &&
                        body.body[0].expression.value === 'use server') {
                      body.body.shift()
                    }
                    
                    // Create serverFunction call using existing pattern
                    const serverFunctionCall = t.variableDeclaration('const', [
                      t.variableDeclarator(
                        t.identifier(functionName),
                        t.callExpression(
                          t.identifier('serverFunction'),
                          [
                            t.stringLiteral(functionName),
                            t.stringLiteral('mutation'),
                            t.memberExpression(t.identifier('z'), t.identifier('any')),
                            t.arrowFunctionExpression(
                              [t.objectPattern([
                                t.objectProperty(t.identifier('input'), t.identifier('input'))
                              ])],
                              params.length === 0 
                                ? body
                                : t.callExpression(
                                    t.arrowFunctionExpression(params, body),
                                    [t.identifier('input')]
                                  )
                            )
                          ]
                        )
                      )
                    ])
                    
                    path.replaceWith(serverFunctionCall)
                    
                    // Add imports
                    const program = path.findParent((p: any) => p.isProgram())
                    if (program) {
                      // Add z import if needed
                      const hasZodImport = program.node.body.some((node: any) => 
                        t.isImportDeclaration(node) && 
                        node.source.value === 'zod' &&
                        node.specifiers.some((spec: any) => spec.imported?.name === 'z' || spec.local?.name === 'z')
                      )
                      if (!hasZodImport) {
                        const zodImport = t.importDeclaration(
                          [t.importSpecifier(t.identifier('z'), t.identifier('z'))],
                          t.stringLiteral('zod')
                        )
                        program.unshiftContainer('body', zodImport)
                      }
                      
                      // Add serverFunction import if needed
                      const hasServerFunctionImport = program.node.body.some((node: any) => 
                        t.isImportDeclaration(node) && 
                        node.source.value.includes('serverFunction') &&
                        node.specifiers.some((spec: any) => spec.imported?.name === 'serverFunction')
                      )
                      if (!hasServerFunctionImport) {
                        const serverFunctionImport = t.importDeclaration(
                          [t.importSpecifier(t.identifier('serverFunction'), t.identifier('serverFunction'))],
                          t.stringLiteral('../shared/serverFunction')
                        )
                        program.unshiftContainer('body', serverFunctionImport)
                      }
                    }
                  }
                  return
                }
              },
              
              VariableDeclaration(path: any) {
                // Transform server actions (arrow functions) in server mode
                if (mode === 'server') {
                  path.node.declarations.forEach((declaration: any) => {
                    if (declaration.id?.name && localServerActions.has(declaration.id.name)) {
                      const functionName = declaration.id.name
                      const init = declaration.init
                      
                      if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
                        const params = init.params
                        let body = init.body
                        
                        // Remove "use server" directive from body if it's a block statement
                        if (t.isBlockStatement(body) && body.body && Array.isArray(body.body) && body.body[0] && 
                            t.isExpressionStatement(body.body[0]) && 
                            t.isStringLiteral(body.body[0].expression) &&
                            body.body[0].expression.value === 'use server') {
                          body.body.shift()
                        }
                        
                        // Replace with serverFunction call
                        declaration.init = t.callExpression(
                          t.identifier('serverFunction'),
                          [
                            t.stringLiteral(functionName),
                            t.stringLiteral('mutation'),
                            t.memberExpression(t.identifier('z'), t.identifier('any')),
                            t.arrowFunctionExpression(
                              [t.objectPattern([
                                t.objectProperty(t.identifier('input'), t.identifier('input'))
                              ])],
                              params.length === 0 
                                ? body
                                : t.callExpression(
                                    t.arrowFunctionExpression(params, body),
                                    [t.identifier('input')]
                                  )
                            )
                          ]
                        )
                        
                        // Add imports
                        const program = path.findParent((p: any) => p.isProgram())
                        if (program) {
                          // Add z import if needed
                          const hasZodImport = program.node.body.some((node: any) => 
                            t.isImportDeclaration(node) && 
                            node.source.value === 'zod' &&
                            node.specifiers.some((spec: any) => spec.imported?.name === 'z' || spec.local?.name === 'z')
                          )
                          if (!hasZodImport) {
                            const zodImport = t.importDeclaration(
                              [t.importSpecifier(t.identifier('z'), t.identifier('z'))],
                              t.stringLiteral('zod')
                            )
                            program.unshiftContainer('body', zodImport)
                          }
                          
                          // Add serverFunction import if needed
                          const hasServerFunctionImport = program.node.body.some((node: any) => 
                            t.isImportDeclaration(node) && 
                            node.source.value.includes('serverFunction') &&
                            node.specifiers.some((spec: any) => spec.imported?.name === 'serverFunction')
                          )
                          if (!hasServerFunctionImport) {
                            const serverFunctionImport = t.importDeclaration(
                              [t.importSpecifier(t.identifier('serverFunction'), t.identifier('serverFunction'))],
                              t.stringLiteral('../shared/serverFunction')
                            )
                            program.unshiftContainer('body', serverFunctionImport)
                          }
                        }
                      }
                    }
                  })
                }
                
                // Remove definitions based on mode
                path.node.declarations.forEach((declaration: any, index: number) => {
                  const name = declaration.id?.name
                  const shouldRemove = (mode === 'server' && localClientComponents.has(name)) ||
                                     (mode === 'client' && localServerActions.has(name))
                  
                  if (name && shouldRemove) {
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