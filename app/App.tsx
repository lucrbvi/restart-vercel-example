import { restartConfig } from "restart.config"
import { Router } from "./router"

export function App() {
	return (
		<Router />
	);
}

export function Body() {
	return (
		<html>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>Restart</title>
				<link rel="stylesheet" href="/styles.css" />
				<link rel="icon" type="image/svg+xml" href="/react.svg"></link>
				{restartConfig.useReactScan && (
					// include react-scan in dev mode only if it's enabled in the config
					<script crossOrigin="anonymous" src="//unpkg.com/react-scan/dist/auto.global.js"></script>
				)}
			</head>
			<body>
				<div id="root">
					{typeof window !== 'undefined' ? <App /> : null}
				</div>
				<script type="module" src="/entrypoint.js" crossOrigin="anonymous"></script>
			</body>
		</html>
	);
}