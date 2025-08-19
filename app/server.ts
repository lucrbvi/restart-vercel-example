import { z } from "zod"
import { serverFunction } from "../shared/serverFunction"
import { newMiddleware } from "../server/middlewares"

export const getName = serverFunction(
  "getName",
  "query",
  z.string(),
  async ({ input }: { input: string }) => `Hello ${input}`
)

newMiddleware(async (ctx) => {
  const { path } = ctx
  if (path.startsWith("/yo")) {
    return new Response("yooo", { status: 200 })
  }
})