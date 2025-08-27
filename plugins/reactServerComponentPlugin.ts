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
        const isServerFile = /[\\/]app[\\/]server[\\/]/.test(args.path)
        
        // Exclude server files from client bundle
        if (mode === 'client' && isServerFile) {
          return {
            contents: '',
            loader: args.path.endsWith(".tsx") ? "tsx" : "jsx",
          }
        }
        
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
        
        // Handle server files - exclude from client bundle completely
        if (/[\\/]app[\\/]server[\\/]/.test(args.path)) {
          // For server mode, process normally but mark as server-only
          const lines = source.split('\n')
          let firstMeaningful: string | null = null
          for (const raw of lines) {
            const line = raw.trim()
            if (!line) continue
            if (line.startsWith('//')) continue
            firstMeaningful = line
            break
          }
          // If file has "use server" directive, ensure it's only processed on server
          if (firstMeaningful === '"use server"' || firstMeaningful === "'use server'") {
            // This file should only exist on server side
            if (mode === 'client') {
              return {
                contents: '',
                loader: args.path.endsWith(".tsx") ? "tsx" : "jsx",
              }
            }
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
                            hasClientDirective = (body.directives && body.directives.some((d: any) => d.value?.value === 'use client'))
                            hasServerDirective = (body.directives && body.directives.some((d: any) => d.value?.value === 'use server'))
                            
                            // Check first statement if it's a string literal
                            if (!hasClientDirective && !hasServerDirective && Array.isArray(body.body) && body.body[0]) {
                              const firstStatement = body.body[0]
                              if (t.isExpressionStatement(firstStatement) && t.isStringLiteral(firstStatement.expression)) {
                                const value = firstStatement.expression.value
                                if (value === 'use client') {
                                  hasClientDirective = true
                                } else if (value === 'use server') {
                                  hasServerDirective = true
                                }
                              }
                            }
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
                  if (!isEntrypoint) {
                    // Export client components for client-side hydration
                    if (mode === 'client' && localClientComponents.size > 0) {
                      localClientComponents.forEach((componentName: string) => {
                        const exportStatement = t.exportNamedDeclaration(null, [
                          t.exportSpecifier(t.identifier(componentName), t.identifier(componentName))
                        ])
                        path.pushContainer('body', exportStatement)
                      })
                    }
                    
                    // Export server actions for server-side registration
                    if (mode === 'server' && localServerActions.size > 0) {
                      localServerActions.forEach((actionName: string) => {
                        const exportStatement = t.exportNamedDeclaration(null, [
                          t.exportSpecifier(t.identifier(actionName), t.identifier(actionName))
                        ])
                        path.pushContainer('body', exportStatement)
                      })
                    }
                  }
                }
              },
              JSXElement(path: any) {
                const openingElement = path.node.openingElement
                if (!t.isJSXIdentifier(openingElement.name)) return
                const componentName = openingElement.name.name
                
                if (mode === 'server') {
                  // Handle client components in server mode - replace with placeholder
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
                      [t.jsxText(`Loading ${componentName}...`)]
                    )
                    path.replaceWith(divElement)
                    return
                  }
                  
                  // Handle server actions used as components (render them server-side)
                  if (localServerActions.has(componentName)) {
                    // Transform <ServerAction /> to {await ServerAction()}
                    const props = openingElement.attributes
                    const args = props.map((attr: any) => {
                      if (t.isJSXAttribute(attr) && t.isStringLiteral(attr.value)) {
                        return attr.value
                      }
                      return t.stringLiteral('')
                    })
                    
                    const callExpression = t.awaitExpression(
                      t.callExpression(
                        t.identifier(componentName),
                        args
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
                
                // Keep server actions intact in server code, but remove "use server" directive and register them
                if (mode === 'server' && localServerActions.has(functionName)) {
                  const body = path.node.body
                  // Remove "use server" directive from body
                  if (body.body && Array.isArray(body.body) && body.body[0] && 
                      t.isExpressionStatement(body.body[0]) && 
                      t.isStringLiteral(body.body[0].expression) &&
                      body.body[0].expression.value === 'use server') {
                    body.body.shift()
                  }
                  
                  // Add registration call after the function
                  const registrationCall = t.expressionStatement(
                    t.callExpression(
                      t.identifier('registerServerAction'),
                      [
                        t.stringLiteral(functionName),
                        t.identifier(functionName)
                      ]
                    )
                  )
                  
                  const program = path.findParent((p: any) => p.isProgram())
                  if (program) {
                    const bodyIndex = program.node.body.indexOf(path.node)
                    program.node.body.splice(bodyIndex + 1, 0, registrationCall)
                    
                    // Add import for registerServerAction
                    const hasRegisterImport = program.node.body.some((node: any) => 
                      t.isImportDeclaration(node) && 
                      node.source.value.includes('serverFunction') &&
                      node.specifiers.some((spec: any) => spec.imported?.name === 'registerServerAction')
                    )
                    if (!hasRegisterImport) {
                      const registerImport = t.importDeclaration(
                        [t.importSpecifier(t.identifier('registerServerAction'), t.identifier('registerServerAction'))],
                        t.stringLiteral('../../shared/serverFunction')
                      )
                      program.unshiftContainer('body', registerImport)
                    }
                  }
                  return
                }
              },
              
              CallExpression(path: any) {
                // Transform server action calls in client mode
                if (mode === 'client') {
                  const callee = path.node.callee
                  if (t.isIdentifier(callee) && localServerActions.has(callee.name)) {
                    // Replace server action call with callServerAction
                    const args = path.node.arguments
                    const callServerActionCall = t.callExpression(
                      t.identifier('callServerAction'),
                      [
                        t.stringLiteral(callee.name),
                        t.arrayExpression(args)
                      ]
                    )
                    path.replaceWith(callServerActionCall)
                    
                    // Add import for callServerAction
                    const program = path.findParent((p: any) => p.isProgram())
                    if (program) {
                      const hasCallServerActionImport = program.node.body.some((node: any) => 
                        t.isImportDeclaration(node) && 
                        node.source.value.includes('callServerAction')
                      )
                      if (!hasCallServerActionImport) {
                        const callServerActionImport = t.importDeclaration(
                          [t.importSpecifier(t.identifier('callServerAction'), t.identifier('callServerAction'))],
                          t.stringLiteral('../../shared/serverFunction')
                        )
                        program.unshiftContainer('body', callServerActionImport)
                      }
                    }
                  }
                }
              },
              
              ImportDeclaration(path: any) {
                // Transform imports from server files
                if (mode === 'server') {
                  const source = path.node.source.value
                  if (source.includes('@/server/') || source.includes('../../server/') || source.includes('./server/')) {
                    const specifiers = path.node.specifiers
                    const registrations: any[] = []
                    specifiers.forEach((spec: any) => {
                      if (t.isImportSpecifier(spec)) {
                        const importedName = t.isIdentifier(spec.imported) ? spec.imported.name : (t.isStringLiteral(spec.imported) ? spec.imported.value : spec.local?.name)
                        const localName = spec.local?.name || importedName
                        if (importedName && localName) {
                          registrations.push(
                            t.expressionStatement(
                              t.callExpression(
                                t.identifier('registerServerAction'),
                                [
                                  t.stringLiteral(importedName),
                                  t.identifier(localName)
                                ]
                              )
                            )
                          )
                        }
                      }
                    })

                    if (registrations.length > 0) {
                      const program = path.findParent((p: any) => p.isProgram())
                      if (program) {
                        const importIndex = program.node.body.indexOf(path.node)
                        program.node.body.splice(importIndex + 1, 0, ...registrations)

                        // Ensure registerServerAction import exists
                        const hasRegisterImport = program.node.body.some((node: any) => 
                          t.isImportDeclaration(node) && 
                          node.source.value.includes('serverFunction') &&
                          node.specifiers.some((spec: any) => spec.imported?.name === 'registerServerAction')
                        )
                        if (!hasRegisterImport) {
                          const registerImport = t.importDeclaration(
                            [t.importSpecifier(t.identifier('registerServerAction'), t.identifier('registerServerAction'))],
                            t.stringLiteral('../../shared/serverFunction')
                          )
                          program.unshiftContainer('body', registerImport)
                        }
                      }
                    }
                  }
                }

                if (mode === 'client') {
                  const source = path.node.source.value
                  if (source.includes('@/server/') || source.includes('../../server/') || source.includes('./server/')) {
                    // Replace server imports with client-safe stubs
                    const specifiers = path.node.specifiers
                                         const newSpecifiers = specifiers.map((spec: any) => {
                       if (t.isImportSpecifier(spec)) {
                         const importedName = t.isIdentifier(spec.imported) ? spec.imported.name : 
                                            t.isStringLiteral(spec.imported) ? spec.imported.value :
                                            spec.local?.name
                                                 // Create a stub function that calls the server action
                         const stubFunction = t.variableDeclaration('const', [
                           t.variableDeclarator(
                             t.identifier(spec.local?.name || importedName),
                             t.arrowFunctionExpression(
                               [t.restElement(t.identifier('args'))],
                               t.blockStatement([
                                 t.returnStatement(
                                   t.callExpression(
                                     t.identifier('callServerAction'),
                                     [
                                       t.stringLiteral(importedName),
                                       t.arrayExpression([t.spreadElement(t.identifier('args'))])
                                     ]
                                   )
                                 )
                               ])
                             )
                           )
                         ])
                        
                        // Add the stub declaration after the import
                        const program = path.findParent((p: any) => p.isProgram())
                        if (program) {
                          const importIndex = program.node.body.indexOf(path.node)
                          program.node.body.splice(importIndex + 1, 0, stubFunction)
                        }
                        
                        // Add import for callServerAction if not already present
                        const hasCallServerActionImport = program.node.body.some((node: any) => 
                          t.isImportDeclaration(node) && 
                          node.source.value.includes('callServerAction')
                        )
                        if (!hasCallServerActionImport) {
                          const callServerActionImport = t.importDeclaration(
                            [t.importSpecifier(t.identifier('callServerAction'), t.identifier('callServerAction'))],
                            t.stringLiteral('../../shared/serverFunction')
                          )
                          program.unshiftContainer('body', callServerActionImport)
                        }
                      }
                      return spec
                    })
                    
                    // Remove the original import
                    path.remove()
                  }
                }
              },
              
              VariableDeclaration(path: any) {
                // Handle server actions first
                if (mode === 'server') {
                  const registrations: any[] = []
                  path.node.declarations.forEach((declaration: any) => {
                    if (declaration.id?.name && localServerActions.has(declaration.id.name)) {
                      const functionName = declaration.id.name
                      const init = declaration.init
                      if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
                        const body = init.body
                        // Remove "use server" directive from body if it's a block statement
                        if (t.isBlockStatement(body) && body.body && Array.isArray(body.body) && body.body[0] && 
                            t.isExpressionStatement(body.body[0]) && 
                            t.isStringLiteral(body.body[0].expression) &&
                            body.body[0].expression.value === 'use server') {
                          body.body.shift()
                        }
                        
                        // Prepare registration
                        registrations.push(
                          t.expressionStatement(
                            t.callExpression(
                              t.identifier('registerServerAction'),
                              [
                                t.stringLiteral(functionName),
                                t.identifier(functionName)
                              ]
                            )
                          )
                        )
                      }
                    }
                  })
                  
                  // Add registrations after the declaration
                  if (registrations.length > 0) {
                    const program = path.findParent((p: any) => p.isProgram())
                    if (program) {
                      const bodyIndex = program.node.body.indexOf(path.node)
                      program.node.body.splice(bodyIndex + 1, 0, ...registrations)
                      
                      // Add import for registerServerAction
                      const hasRegisterImport = program.node.body.some((node: any) => 
                        t.isImportDeclaration(node) && 
                        node.source.value.includes('serverFunction') &&
                        node.specifiers.some((spec: any) => spec.imported?.name === 'registerServerAction')
                      )
                      if (!hasRegisterImport) {
                        const registerImport = t.importDeclaration(
                          [t.importSpecifier(t.identifier('registerServerAction'), t.identifier('registerServerAction'))],
                          t.stringLiteral('../../shared/serverFunction')
                        )
                        program.unshiftContainer('body', registerImport)
                      }
                    }
                  }
                }
                
                if (mode === 'client') {
                  path.node.declarations.forEach((declaration: any) => {
                    if (declaration.id?.name && localServerActions.has(declaration.id.name)) {
                      const functionName = declaration.id.name
                      const init = declaration.init
                      if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
                        const params = init.params
                        // Replace with client-side caller
                        declaration.init = t.arrowFunctionExpression(
                          params,
                          t.blockStatement([
                            t.returnStatement(
                              t.callExpression(
                                t.identifier('callServerAction'),
                                [
                                  t.stringLiteral(functionName),
                                  t.arrayExpression(params.map((param: any) => t.identifier(param.name)))
                                ]
                              )
                            )
                          ])
                        )
                        
                        // Add import for callServerAction
                        const program = path.findParent((p: any) => p.isProgram())
                        if (program) {
                          const hasCallServerActionImport = program.node.body.some((node: any) => 
                            t.isImportDeclaration(node) && 
                            node.source.value.includes('callServerAction')
                          )
                          if (!hasCallServerActionImport) {
                            const callServerActionImport = t.importDeclaration(
                              [t.importSpecifier(t.identifier('callServerAction'), t.identifier('callServerAction'))],
                              t.stringLiteral('../../shared/serverFunction')
                            )
                            program.unshiftContainer('body', callServerActionImport)
                          }
                        }
                      }
                    }
                  })
                }
                
                // Remove client components from server code
                path.node.declarations = path.node.declarations.filter((declaration: any) => {
                  const name = declaration.id?.name
                  if (!name) return true
                  
                  // Remove client components from server code
                  if (mode === 'server' && localClientComponents.has(name)) {
                    return false
                  }
                  
                  return true
                })
                
                if (path.node.declarations.length === 0) {
                  path.remove()
                }
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