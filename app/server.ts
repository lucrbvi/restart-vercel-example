import { z } from "zod"
import { serverFunction } from "../shared/serverFunction"
import { newMiddleware } from "../server/middlewares"

// You can declare serverFunctions and Middlewares anywhere in your codebase, even in the app folder! 
// Our plugin will automatically clean up the codebase for you to not contaminate the client bundle with your secret server code.

export const getName = serverFunction(
  "getName",
  "query",
  z.string(),
  async ({ input }: { input: string }) => `Hello ${input}`
)

export const getServerTime = serverFunction(
  "getServerTime",
  "query",
  z.void(),
  async () => new Date().toISOString()
)

newMiddleware(async (ctx) => {
  const { path } = ctx
  if (path.startsWith("/yo")) {
    return Response.redirect("https://youtube.com/watch?v=kB8LcQucKyY", 302)
  }
})