interface RestartConfig {
  port: number,
  trpcEndpoint: string,
  reactCompiler?: { useReactCompiler: boolean, reactCompilerConfig?: any }
}

export const restartConfig: RestartConfig = {
  port: 3000,
  trpcEndpoint: "/trpc",
  reactCompiler: {
    useReactCompiler: true,
    reactCompilerConfig: {
        target: '19', // https://react.dev/reference/react-compiler/configuration
    }
  }
}