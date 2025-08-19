import ZodTypeAny from "zod"

export type Kind = "query" | "mutation"

export type Entry = {
  name: string
  kind: Kind
  input: ZodTypeAny
  resolve: (opts: { input: any }) => any
}

export const registry: Entry[] = []
