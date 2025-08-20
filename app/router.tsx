import { Route, Switch, Router as WouterRouter } from 'wouter'
import { lazy, Suspense, useMemo } from 'react'

function filePathToRoutePath(filePath: string): string {
  let p = filePath.replace('./routes', '')
  p = p.replace(/\.tsx$/, '')
  if (p === '/index') return '/'
  if (p.endsWith('/index')) return p.slice(0, -('/index'.length))
  return p
}

// Server-side implementation of import.meta.glob
function getServerModules(): Record<string, () => Promise<any>> {
  if (typeof window !== 'undefined') {
    // Client-side: should be transformed by bunGlobPlugin
    return {}
  }
  
  // Server-side: use Bun.Glob directly
  const cwd = process.cwd().replace(/\\/g, "/")
  const glob = new Bun.Glob(cwd + "/app/routes/**/*.tsx")
  const modules: Record<string, () => Promise<any>> = {}
  
  for (const match of glob.scanSync({ cwd })) {
    const abs = match.startsWith("/") ? match : cwd + "/" + match
    const rel = abs.replace(/\\/g, "/").replace(cwd + "/app/", "./")
    modules[rel] = () => import(abs)
  }
  
  return modules
}

function useSSRLocation() {
  if (typeof window !== 'undefined') {
    return undefined // Use default browser location
  }
  
  // Server-side: return current path from global context
  return {
    pathname: (globalThis as any).__SSR_PATH__ || '/',
    search: '',
    hash: ''
  }
}

export function Router() {
  const modules = typeof window !== 'undefined' 
    ? ((import.meta as any).glob?.('./routes/**/*.tsx') as Record<string, () => Promise<any>> || {})
    : getServerModules()

  const routes = useMemo(() => {
    const entries = Object.entries(modules).map(([filePath, loader]) => {
      const path = filePathToRoutePath(filePath)
      const LazyComponent = lazy(() => (loader as () => Promise<any>)().then((m) => ({ default: m.default ?? m })))
      const Wrapped = (props: any) => (
        <Suspense fallback={null}>
          <LazyComponent {...props} />
        </Suspense>
      )
      return { path, component: Wrapped }
    })
    entries.sort((a, b) => b.path.length - a.path.length)
    return entries
  }, [])

  const RouterContent = () => {
    if (routes.length === 0) {
      const Fallback = lazy(() => import('./routes/index').then((m) => ({ default: m.default ?? m })))
      const Wrapped = (props: any) => (
        <Suspense fallback={null}>
          <Fallback {...props} />
        </Suspense>
      )
      return (
        <Switch>
          <Route path="/" component={Wrapped as any} />
        </Switch>
      )
    }

    return (
      <Switch>
        {routes.map(({ path, component }) => (
          <Route key={path} path={path} component={component as any} />
        ))}
        <Route>Page not found (404)</Route>
      </Switch>
    )
  }

  const ssrLocation = useSSRLocation()
  
  if (typeof window === 'undefined' && ssrLocation) {
    // Server-side: use custom location
    return (
      <WouterRouter hook={() => [ssrLocation.pathname, () => {}]}>
        <RouterContent />
      </WouterRouter>
    )
  }

  // Client-side: use default browser location
  return <RouterContent />
}