// Handler for serverless functions

import type { Server } from "bun";
import { file } from "bun";
import pathLib from "path";
import { renderToReadableStream } from "react-dom/server";
import { pathToFileURL } from "node:url";

function getContentType(ext: string): string {
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

export async function fetchHandler(req: Request, server: Server): Promise<Response> {
  const path = new URL(req.url).pathname;
  const isDevMode = process.env.NODE_ENV === 'development';

  if (path.startsWith('/.well-known/'))  {
    return new Response("Not Found", { status: 404 });
  }

  if (path !== "/") {
    const filePath = pathLib.join(process.cwd(), "dist", path);
    const staticFile = file(filePath);
    if (await staticFile.exists()) {
      const ext = pathLib.extname(path).toLowerCase();
      const contentType = getContentType(ext);
      return new Response(staticFile, {
        headers: { "Content-Type": contentType },
      });
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

    const routeModulePath = pathLib.join(process.cwd(), "dist", "routes", modulePath + ".js");
    const routeModule = await import(pathToFileURL(routeModulePath).href);
    const { default: PageComponent } = routeModule;
    const { Body } = await import("../app/App");

    const stream = await renderToReadableStream(
      <Body><PageComponent /></Body>
    );
    await (stream as any).allReady;

    return new Response(stream, {
      headers: { "Content-Type": "text/html" },
    });

  } catch (e) {
    console.error(`SSR Error for path ${path}:`, e);
    try {
        const { Body, App } = await import("../app/App");
        const stream = await renderToReadableStream(<Body><App /></Body>);
        await (stream as any).allReady;
        return new Response(stream, {
            headers: { "Content-Type": "text/html" },
        });
    } catch (ssrError) {
        console.error("Fallback SSR Error:", ssrError);
        return new Response("Server Error", { status: 500 });
    }
  }
}