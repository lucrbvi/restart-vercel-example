import type { Server } from "bun"

export type MiddlewareContext = {
  req: Request
  server: Server
  path: string
  isDevMode: boolean
  isStaticMode: boolean
  state: Record<string, any>
}

export type Middleware = {
  onRequest?: (ctx: MiddlewareContext) => Promise<Response | void> | Response | void
  onResponse?: (ctx: MiddlewareContext, res: Response) => Promise<Response> | Response
}

export const middlewares: Middleware[] = []

/**
 * Create a new middleware, i.e. some functions that will be run on the request and/or the response to tweak the server behavior.
 * @param onRequest The function to run on the request.
 * @param onResponse The function to run on the response.
 * @returns
 */
export function newMiddleware(json: {onRequest?: Middleware["onRequest"], onResponse?: Middleware["onResponse"]}): Middleware {
  const middleware = json as Middleware;
  middlewares.push(middleware)
  return middleware
}