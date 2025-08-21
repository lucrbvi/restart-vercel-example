# Restart: the open React framework

Restart is a *minimal* and fully transparent full-stack React framework. All the code for Restart is fully accessible in the template and you can modify it as well.

Restart relly on some cool techs to work:
1. <a href="https://bun.sh/" target="_blank">Bun</a>: bundler and runtime
2. <a href="https://typescriptlang.org/" target="_blank">TypeScript</a>: the cooler and safer JavaScript
3. <a href="https://trpc.io/" target="_blank">tRPC</a>: expose type-safe backend functions to the frontend
4. <a href="https://tailwindcss.com/" target="_blank">Tailwind</a>: make css writing way easier
5. <a href="https://github.com/molefrog/wouter" target="_blank">Wouter</a>: a minimal file-based router
6. <a href="https://zustand.docs.pmnd.rs/" target="_blank">Zustand</a>: easy state-management solution for React

<br/>

Restart is a true modern framework:
- You can use <a href="https://react.dev/reference/rsc/server-components" target="_blank">React Server Components</a> and <a href="https://react.dev/reference/rsc/server-functions" target="_blank">Server Functions</a>.
- You can use the React Compiler (check <a href="./restart.config.ts" target="_blank">`restart.config.ts`</a> and <a href="plugins/reactCompilerPlugin.ts" target="_blank">our Bun plugin</a>).
- You can define in a **secure** way backend functions with `serverFunction`, it's an easy way to write tRPC public procedure (*it does not leak to the client*).
- You can create your own middlewares with `newMiddleware`.

PROBLEMS:
- React Server Functions are bundle into the client JS, it expose the React Server Functions' code in client (very dangerous)