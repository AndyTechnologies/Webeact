import glob from "./iglob.js";
import router from "./router.js";
import templateEngine from "./ssr.js";
import path from "path";
const routing = router();

const CMPNAME =
	process.env.COMPONENTS_DIRECTORY || path.join(process.cwd(), "components");
const LIBNAME =
	process.env.LIB_DIRECTORY || path.join(process.cwd(), "Lib");
const COMPONENTS_REFRESH_TIME = process.env.COMPONENTS_REFRESH_TIME || (2.5 * 1000); // 2.5 segundos

const renderMiddleware = templateEngine({
	viewsDirectory: CMPNAME,
	cacheSize: 25,
	isProduction: process.env.NODE_ENV === "production",
	streaming: true,
	// Context functions avaiables for SSR
	helpers: {
		getFilesNames,
		getEnv: () => {
			return {
				CMPNAME, LIBNAME, COMPONENTS_REFRESH_TIME, ...process.env
			}
		},
		glob,
		path,
		thisRouter: routing,
		createRouter: router
	}
});

// Servir todos los scripts del lib
routing.use_static(LIBNAME);
routing.use(renderMiddleware);

routing.get("/component/:name", (req, res) => {
	const componentName = req.params.name;
	const attrs = {componentName, ...req.query};
	res.renderComponent(`${componentName}.html`, attrs);
});

routing.get("/files", (_req, res) => {
	res.end(getFilesNames());
});

routing.get("/connect", (req, res) => {
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
	sendEvent(getFilesNames());
	// Y luego actualizar cada cierta cantidad de segundos
	const intervalId = setInterval(() => {
		sendEvent(getFilesNames());
	}, COMPONENTS_REFRESH_TIME); // actualizar información cada cierta cantidad de segundos

	// When client closes connection, stop sending events
	req.on("close", () => {
		clearInterval(intervalId);
		res.end();
	});
});

function getFilesNames() {
	return glob(
		path.join(CMPNAME, "*.*"),
		(s) => {
			const ss = s.split("/");
			return ss[ss.length - 1].split('.')[0].toLowerCase();
		});
}

/*
Options:
	alwaysCallToNext: after call to the middleware router, always call to the next handler (false)
	logRequest: show request url informations before call middleware
*/
export function createMiddleware(
	options = { alwaysCallToNext: false, logRequest: false },
) {
	return (req, res, next) => {
		if (options.logRequest)
			console.log(`[LOG] - Request ${req.originalUrl} from ${req.ip}`);
		// if the router don´t catch the request, call to next
		if (!routing.middleware(req, res, next) || options.alwaysCallToNext) next();
	};
}

export default createMiddleware;
