/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 * 
 * It included in the `Body()` element in the server (`server/index.tsx`)
 */

import { hydrateRoot, createRoot } from "react-dom/client"
import { App } from "@/App"
import { restartConfig } from "restart.config"
import { Component } from "react"

// Error boundary component for client components
class ClientErrorBoundary extends Component<
  { children: React.ReactNode, fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, errorInfo: any) {
    console.error('Client component error:', error, errorInfo)
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
        const rootElement = document.getElementById("root")
        
        if (rootElement) {
            if (!restartConfig.useReactServerComponents) {
                const app = (
                  <App/>
                )
                const hasSSRContent = rootElement.firstElementChild !== null
                if (hasSSRContent) {
                  hydrateRoot(rootElement, app)
                } else {
                  createRoot(rootElement).render(app)
                }
            } else {
                // RSC mode: Server already rendered everything, just hydrate client components
                const clientSlots = document.querySelectorAll('[restart-react-client-component]')
                
                clientSlots.forEach(async (slot) => {
                    const componentId = slot.getAttribute('restart-react-client-component')
                    if (componentId) {
                        try {
                            let Component: any
                            
                            if (componentId.includes(':')) {
                                const [routeRelPath, componentName] = componentId.split(':')
                                const routePath = `./routes/${routeRelPath}.tsx`
                                const routeModules = import.meta.glob('./routes/**/*.tsx')
                                const moduleLoader = routeModules[routePath]
                                
                                if (moduleLoader) {
                                    const module = await moduleLoader() as any
                                    Component = module[componentName as keyof typeof module] ?? module.default
                                }
                            }
                            
                            if (Component) {
                                const clientRoot = createRoot(slot)
                                clientRoot.render(<Component />)
                            } else {
                                console.error(`Component not found: ${componentId}`)
                            }
                        } catch (error) {
                            console.error(`Failed to load component: ${componentId}`, error)
                        }
                    }
                })
            }
        } else {
            console.error("Root element not found")
        }
    } catch (e) {
        console.error("Hydration error:", e)
    }
}