import path from "node:path";
import { file } from "bun";
import { pathToFileURL, fileURLToPath } from "node:url";

export default async function handler(req: Request) {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const distRoot = path.join(thisDir, "..", "dist");
  const handlerPath = path.join(thisDir, "..", "server", "handler.js");

  try {
    const { fetchHandler } = await import(pathToFileURL(handlerPath).href);
    return fetchHandler(req, null as any);
  } catch (e) {
    console.error("Handler load failed", { handlerPath, distRoot }, e);
    return new Response("Server Error: handler missing", { status: 500 });
  }
}