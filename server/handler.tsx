import path from "node:path";
import { pathToFileURL } from "node:url";
import { file } from "bun";

export default async function handler(req: Request) {
  const abs = path.join(process.cwd(), "dist", "server", "handler.js");
  try {
    const { fetchHandler } = await import(pathToFileURL(abs).href);
    return fetchHandler(req, null as any);
  } catch (e) {
    console.error("Failed to load dist/server/handler.js at", abs, e);
    const indexPath = path.join(process.cwd(), "dist", "index.html");
    const f = file(indexPath);
    if (await f.exists()) {
      return new Response(f, { headers: { "Content-Type": "text/html" } });
    }
    return new Response("Server Error: handler missing", { status: 500 });
  }
}