import { restartConfig } from "restart.config"
import { Router } from "./router"
import { Router as WouterRouter } from "wouter"

export function App() {
	return (
		<Router />
	);
}

function BodyHTML(props: { children: React.ReactNode }) {
	return (
		<html>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>Cool blog</title>
				<link rel="stylesheet" href="/styles.css" />
				<link rel="icon" type="image/svg+xml" href="/react.png"></link>
				{restartConfig.useReactScan && process.env.NODE_ENV === "development" && (
					<script crossOrigin="anonymous" src="//unpkg.com/react-scan/dist/auto.global.js"></script>
				)}
			</head>
			<body>
				<div
					id="root"
					data-rsc={restartConfig.useReactServerComponents ? "1" : undefined}
				>
					{props.children}
				</div>
				<script type="module" src="/entrypoint.js" crossOrigin="anonymous"></script>
			</body>
		</html>
	)
}

export const Body = restartConfig.useReactServerComponents 
	? async function Body(props: { children: React.ReactNode }) {
			return <BodyHTML>{props.children}</BodyHTML>
		}
	: function Body(props: { children: React.ReactNode }) {
			return <BodyHTML>{props.children}</BodyHTML>
		}

export const BodySync = function BodySync(props: { children: React.ReactNode }) {
	return <BodyHTML>{props.children}</BodyHTML>
}