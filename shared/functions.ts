import { z } from "zod"
import { serverFunction } from "./serverFunction"

export const getName = serverFunction(
  "getName",
  "query",
  z.string(),
  async ({ input }: { input: string }) => `Hello ${input}`
)