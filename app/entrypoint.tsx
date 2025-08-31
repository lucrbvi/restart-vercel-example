/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 * 
 * It included in the `Body()` element in the server (`server/index.tsx`)
 */

import { hydrateRoot, createRoot } from "react-dom/client"
import { App } from "@/App"
import { restartConfig } from "restart.config"

// WeakMap pour suivre les roots React des îlots et pouvoir les démonter
const islandRoots = new WeakMap<Element, ReturnType<typeof createRoot>>()

function findAnchor(el: EventTarget | null): HTMLAnchorElement | null {
  let node = el as HTMLElement | null
  while (node && node !== document.body) {
    if (node instanceof HTMLAnchorElement) return node
    node = node.parentElement
  }
  return null
}

async function loadComponentById(componentId: string): Promise<any> {
  let Component: any
  if (componentId.includes(":")) {
    const [routeRelPath, componentName] = componentId.split(":")
    const routePath = `./routes/${routeRelPath}.tsx`
    const routeModules = import.meta.glob("./routes/**/*.tsx")
    const moduleLoader = routeModules[routePath]
    if (moduleLoader) {
      const module = (await moduleLoader()) as any
      Component = module[componentName as keyof typeof module] ?? module.default
    }
  }
  return Component
}

async function hydrateIslandsIn(container: ParentNode = document) {
  const clientSlots = Array.from(container.querySelectorAll(
    "[restart-react-client-component]"
  ))
  for (const slot of clientSlots) {
    const el = slot as HTMLElement
    // Si déjà hydraté, on saute
    if (islandRoots.has(el)) continue
    const componentId = el.getAttribute("restart-react-client-component")
    if (!componentId) continue
    try {
      let props: any = {}
      const propsJson = el.getAttribute("data-props")
      if (propsJson) {
        try {
          props = JSON.parse(propsJson)
        } catch (e) {
          console.error(
            "Failed to parse RSC client props JSON:",
            e,
            propsJson
          )
        }
      }
      const Component = await loadComponentById(componentId)
      if (Component) {
        const root = createRoot(el)
        islandRoots.set(el, root)
        root.render(<Component {...props} />)
      } else {
        console.error(`Component not found: ${componentId}`)
      }
    } catch (error) {
      console.error(`Failed to load component: ${componentId}`, error)
    }
  }
}

async function rscNavigate(
  url: string,
  opts: { replace?: boolean } = {}
): Promise<void> {
  const root = document.getElementById("root")
  if (!root) return

  // Démonter les îlots existants pour éviter les fuites
  const oldSlots = root.querySelectorAll("[restart-react-client-component]")
  oldSlots.forEach((slot) => {
    const rootInstance = islandRoots.get(slot as Element)
    try {
      rootInstance?.unmount()
    } catch {}
  })

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        // permet de détecter requêtes client si plus tard on veut renvoyer un fragment
        "X-Requested-With": "restart-rsc",
      },
      credentials: "same-origin",
    })
    if (!res.ok) {
      // Fallback: navigation dure
      window.location.href = url
      return
    }
    const html = await res.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    const newRoot = doc.getElementById("root")
    if (!newRoot) {
      // Fallback si structure inattendue
      window.location.href = url
      return
    }

    // Met à jour le titre
    if (doc.title) {
      document.title = doc.title
    }

    // Remplace le contenu de #root (on ne réexécute pas entrypoint.js)
    root.innerHTML = newRoot.innerHTML

    // Met à jour l'historique
    if (opts.replace) {
      history.replaceState({}, "", url)
    } else {
      history.pushState({}, "", url)
    }

    // Réhydrater les îlots de la nouvelle page
    await hydrateIslandsIn(root)

    // Optionnel: scroll en haut
    window.scrollTo(0, 0)
  } catch (e) {
    console.error("Soft navigation failed; doing hard reload.", e)
    window.location.href = url
  }
}

function enableRscNavigation() {
  if (!restartConfig.useReactServerComponents) return

  // Interception des clics (phase capture) avant Wouter
  document.addEventListener(
    "click",
    (e) => {
      // Respecter modificateurs / cibles spéciales
      if (
        (e as MouseEvent).defaultPrevented ||
        (e as MouseEvent).button !== 0 ||
        (e as MouseEvent).metaKey ||
        (e as MouseEvent).ctrlKey ||
        (e as MouseEvent).shiftKey ||
        (e as MouseEvent).altKey
      ) {
        return
      }
      const a = findAnchor(e.target)
      if (!a) return
      if (
        a.target &&
        a.target !== "" &&
        a.target.toLowerCase() !== "_self"
      ) {
        return
      }
      if (a.hasAttribute("download") || a.getAttribute("rel") === "external") {
        return
      }
      const href = a.getAttribute("href")
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return
      }
      const url = new URL(href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Option: data-hard-nav pour forcer la navigation dure
      if (a.dataset.hardNav === "1") return

      e.preventDefault()
      // Bloque la propagation pour éviter le onClick du <Link> Wouter
      e.stopImmediatePropagation?.()
      rscNavigate(url.pathname + url.search + url.hash)
    },
    { capture: true }
  )

  // Gérer Back/Forward
  window.addEventListener("popstate", () => {
    const url = window.location.pathname + window.location.search + window.location.hash
    rscNavigate(url, { replace: true })
  })
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
                // RSC mode: hydrate islands and enable soft navigation
                hydrateIslandsIn()
                enableRscNavigation()
            }
        } else {
            console.error("Root element not found")
        }
    } catch (e) {
        console.error("Hydration error:", e)
    }
}