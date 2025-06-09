import glob from "./iglob.js";
import router from "./router.js";
import path from "path";
import * as fs from "fs";

const routing = router();

export const CMPNAME =
	process.env.COMPONENTS_DIRECTORY || path.join(process.cwd(), "components");
export const LIBNAME =
	process.env.LIB_DIRECTORY || path.join(process.cwd(), "Lib");

function renderComponent(name, attrs) {
	const template = fs.readFileSync(`${CMPNAME}/${name}.html`, "utf-8");
	let rendered = template;
	Object.entries(attrs).forEach(([key, value]) => {
		rendered = rendered.replace(new RegExp(`{{${key}}`, "g"), value);
	});
	return rendered;
}

// Servir todos los scripts del lib
routing.static(LIBNAME);

routing.get("/component/:name", async (req, res) => {
	const componentName = req.params.name;
	const attrs = req.query;
	const html = renderComponent(componentName, attrs);
	res.send(`${html}`);
});

routing.get("/files", async (_req, res) => {
	res.send(await getFilesNames());
});

routing.get("/connect", async (req, res) => {
	// Cabeceras necesarias para el SSE
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");

	// Mandar un mensaje inicial al cliente
	res.write(`data: Webeact SSE\n\n`);
	const sendEvent = (data) => {
		res.write(`event: update\n`);
		res.write(`data: ${JSON.stringify(data)}\n\n`);
	};

	// mandar un mensaje con los archivos detectados
	sendEvent(await getFilesNames());
	// Y luego actualizar cada 2.5 segundos
	const intervalId = setInterval(async () => {
		sendEvent(await getFilesNames());
	}, 2500); // actualizar información cada 2.5 segundos

	// When client closes connection, stop sending events
	req.on("close", () => {
		clearInterval(intervalId);
		res.end();
	});
});

async function getFilesNames() {
	return glob(path.join(CMPNAME, "*.*"))
		.map((s) => s.split("/"))
		.map((s) => s[s.length - 1])
		.map((s) => s.split(".")[0])
		.map((s) => s.toLowerCase());
}

/*
Options:
	alwaysCallToNext: after call to the middleware router, always call to the next handler (false)
	logRequest: show request url informations before call middleware
*/
export function createMiddleware(options = { alwaysCallToNext: false, logRequest: false }) {
	return (req, res, next) => {
		if( options.logRequest )
			console.log(`Request Info:
\tBase URL: ${req.baseUrl}
\tURL: ${req.url}
\tOriginal URL: ${req.originalUrl}
`);
		if( !routing.middleware(req, res) || options.alwaysCallToNext )
			next(); // if the router don´t catch the request, call to next
	};
}

export default createMiddleware;
