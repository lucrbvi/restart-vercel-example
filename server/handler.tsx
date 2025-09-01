// Handler for serverless functions

import type { Server } from "bun";
import { file } from "bun";
import pathLib from "path";
import { renderToReadableStream } from "react-dom/server";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { Body } from "../app/App";

function getContentType(ext: string): string {
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

function resolveDistRoot(currentDir: string): string {
    const candidates = [
      pathLib.join(currentDir, "..", "dist"), // api/_server -> api/dist
      pathLib.join(currentDir, ".."),         // dist/api     -> dist
      pathLib.join(process.cwd(), "api", "dist"), // dev/alt
      pathLib.join(process.cwd(), "dist"),    // dev local
    ];
    for (const p of candidates) {
      if (existsSync(pathLib.join(p, "index.html"))) return p;
    }
    return pathLib.join(currentDir, "..");
  }

export async function fetchHandler(req: Request, server: Server): Promise<Response> {
  const path = new URL(req.url).pathname;
  const thisDir = pathLib.dirname(fileURLToPath(import.meta.url));
  const distRoot = resolveDistRoot(thisDir);

  if (path !== "/") {
    const filePath = pathLib.join(distRoot, path);
    const staticFile = file(filePath);
    if (await staticFile.exists()) {
      const ext = pathLib.extname(path).toLowerCase();
      const contentType = getContentType(ext);
      return new Response(staticFile, {
        headers: { "Content-Type": contentType },
      });
    }
    const ext = pathLib.extname(path);
    if (ext) {
      return new Response("Not Found", { status: 404 });
    }
  }

  try {
    (globalThis as any).__SSR_PATH__ = path;
    const routeName = path.slice(1) || "index";
    
    const routeParts = routeName.split('/');
    let modulePath = routeName;
    if (routeParts[0] === 'posts' && !isNaN(Number(routeParts[1]))) {
        modulePath = 'posts/[id]';
    }

    const routeModulePath = pathLib.join(distRoot, "routes", modulePath + ".js");
    const routeModule = await import(pathToFileURL(routeModulePath).href);
    const { default: PageComponent } = routeModule;

    const stream = await renderToReadableStream(
      <Body><PageComponent /></Body>
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/html",
        "CDN-Cache-Control": "max-age=300, stale-while-revalidate=86400",
        "Vercel-CDN-Cache-Control": "max-age=300",
        "Cache-Control": "public, max-age=0, must-revalidate"
        }
    });

    } catch (e) {
    console.error(`SSR Error for path ${path}:`, e);
    const indexPath = pathLib.join(distRoot, "index.html");
    const indexFile = file(indexPath);
    if (await indexFile.exists())
      return new Response(indexFile, { headers: { "Content-Type": "text/html" } });
    return new Response("Server Error", { status: 500 });
  }
}