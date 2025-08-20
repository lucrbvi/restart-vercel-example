/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 * 
 * It included in the `Body()` element in the server (`server/index.tsx`)
 */

import { hydrateRoot, createRoot } from "react-dom/client"
import { App } from "@/App"
import { restartConfig } from "restart.config"

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
                const routeModules = import.meta.glob('./routes/**/*.tsx')
                
                const clientSlots = document.querySelectorAll('[restart-react-client-component]')
                clientSlots.forEach(async (slot) => {
                    const componentId = slot.getAttribute('restart-react-client-component')
                    if (componentId) {
                        try {
                            let Component: any
                            
                            if (componentId.includes(':')) {
                                const [routeRelPath, componentName] = componentId.split(':')
                                const routePath = `./routes/${routeRelPath}.tsx`
                                const moduleLoader = routeModules[routePath]
                                
                                if (moduleLoader) {
                                    const module = await moduleLoader() as any
                                    Component = module[componentName as any] ?? module.default
                                }
                            } else {
                                // Fallback: try default export on current page module if we can infer it
                                // Not always possible, so we skip to avoid false mounting
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