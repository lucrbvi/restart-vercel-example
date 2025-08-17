// SERVER CODE

import { serve, file } from "bun"
import { renderToReadableStream } from "react-dom/server"
import { App } from "app/App"

function Body() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Bun + React</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <div id="root">
          <App />
        </div>
        <script src="/entrypoint.js" type="module"/>
      </body>
    </html>
  )
}

console.log("Building client...")
try{
  await Bun.build({
    entrypoints: ['./src/client/entrypoint.tsx'],
    outdir: './dist',
    target: 'browser',
    format: 'esm',
  })
  console.log("Client builded")
} catch (e) {
  console.error("Building error:", e)
  process.exit(1)
}


const server = serve({
  async fetch(req) {
    const path = new URL(req.url).pathname

    if (path === "/") {
      try {
        const stream = await renderToReadableStream(<Body/>, {
          bootstrapScripts: ["/entrypoint.js"]
        })
        return new Response(stream, {
          headers: { 
            "Content-Type": "text/html",
            "Cache-Control": "no-cache"
           },
        })
      } catch (e) {
        console.error("SSR error:", e)
        return new Response("Server Error (500)", { status: 500 })
      }
    }

    if (path.endsWith(".css") || path.endsWith(".svg")) {
      const Filepath = path.split("/").pop()
      const publicFile = file("public/" + Filepath)
      const endExtension = path.split(".")[1]
      return new Response(publicFile, {
        headers: { "Content-Type": `text/${endExtension}`}
      })
    }

    if (path.endsWith(".js")) {
      const Filepath = path.split("/").pop()
      const publicFile = file("dist/" + Filepath)
      return new Response(publicFile, {
        headers: { "Content-Type": `application/javascript`}
      })
    }

    return new Response("Page not found (404)", { status: 404 })
  },
});

console.log(`Listening on ${server.url}`)