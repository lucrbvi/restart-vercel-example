import { file } from "bun";
import path from "node:path";

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Serve static files from dist directory
  if (pathname.startsWith('/api/')) {
    // Handle API routes
    return new Response('API endpoint', { status: 200 });
  }

  // Try to serve static files
  const staticPath = path.join(process.cwd(), "dist", pathname === "/" ? "index.html" : pathname);
  const staticFile = file(staticPath);
  
  if (await staticFile.exists()) {
    const contentType = getContentType(pathname);
    return new Response(staticFile, { 
      headers: { "Content-Type": contentType } 
    });
  }

  // Fallback to index.html for SPA routing
  const indexPath = path.join(process.cwd(), "dist", "index.html");
  const indexFile = file(indexPath);
  
  if (await indexFile.exists()) {
    return new Response(indexFile, { 
      headers: { "Content-Type": "text/html" } 
    });
  }

  return new Response("Not Found", { status: 404 });
}

function getContentType(pathname: string): string {
  const ext = path.extname(pathname).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  return contentTypes[ext] || 'text/plain';
}