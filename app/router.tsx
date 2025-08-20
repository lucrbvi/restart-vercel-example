import { Route, Switch } from 'wouter'
import { lazy, Suspense, useMemo } from 'react'

function filePathToRoutePath(filePath: string): string {
  let p = filePath.replace('./routes', '')
  p = p.replace(/\.tsx$/, '')
  if (p === '/index') return '/'
  if (p.endsWith('/index')) return p.slice(0, -('/index'.length))
  return p
}

export function Router() {
  // @ts-ignore - our own implementation of import.meta.glob in Bun
  const modules = import.meta.glob('./routes/**/*.tsx') as Record<string, () => Promise<any>>

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