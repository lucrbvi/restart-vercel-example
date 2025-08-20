interface RestartConfig {
  port: number,
  trpcEndpoint: string,
  reactCompiler?: { useReactCompiler: boolean, reactCompilerConfig?: any },
  useReactScan?: boolean,
  useReactServerComponents?: boolean
}

export const restartConfig: RestartConfig = {
  port: 3000,
  trpcEndpoint: "/trpc",
  reactCompiler: {
    useReactCompiler: true,
    reactCompilerConfig: {
        target: '19', // https://react.dev/reference/react-compiler/configuration
    }
  },
  useReactScan: true, // if true, it will use react-scan for dev mode only
  useReactServerComponents: true
}