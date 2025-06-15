import url from "url";
import path from "path";
import * as fs from "fs";

// =======================
// 1. Middleware para servir archivos estáticos
// =======================
function parseURL(req){
	const parsed = new URL(req.url, `http://${req.headers.host}`);
	return decodeURIComponent(parsed.pathname);
}

function sanitizePath(pathname, absRoot){
	// Normalize + quitar "../" + eliminar slash inicial
	let safe = path.normalize(pathname).replace(/^(\.\.(\/|\\))+/g, "");
	safe = safe.replace(/^[/\\]+/, "");
	return path.join(absRoot, safe);
}

function serveStatic(rootDir) {
	// Asegurarnos de tener la ruta absoluta de la raíz
	const absRoot = path.resolve(rootDir);
	console.log(`Absolute Route: ${absRoot}`);
	return (req, res) => {
		// Parseamos URL usando la clase URL para evitar sorpresas
		let pathname = parseURL(req);

		// Normalize + quitar "../" + eliminar slash inicial
		const filePath = sanitizePath(pathname,absRoot);

		// No salirse de absRoot
		if (!filePath.startsWith(absRoot + path.sep)) {
			console.error("Forbidden on request");
			return false;
		}

		if( !fs.existsSync(filePath) ){
			return false;
		}

		const stats = fs.statSync(filePath);
		if (!stats.isFile()) {
			// NO enviamos respuesta aquí, delegamos al siguiente handler
			console.error("Resource is not a file!");
			return false;
		}

		// MIME types
		const ext = path.extname(filePath).toLowerCase();
		const mimeTypes = {
			".html": "text/html; charset=utf-8",
			".js": "application/javascript; charset=utf-8",
			".css": "text/css; charset=utf-8",
			".json": "application/json; charset=utf-8",
			".png": "image/png",
			".jpg": "image/jpeg",
			".gif": "image/gif",
			".txt": "text/plain; charset=utf-8",
			".ico": "image/x-icon",
		};
		const contentType = mimeTypes[ext] || "application/octet-stream";

		// Stream del archivo
		res.writeHead(200, { "Content-Type": contentType });
		const stream = fs.createReadStream(filePath);
		stream.on("error", (streamErr) => {
			console.error("Stream error:", streamErr);
			if (!res.headersSent) {
				res.writeHead(500, { "Content-Type": "text/plain" });
			}
			return res.end("Internal Server Error");
		});
		stream.pipe(res);

		return true;
	};
}

// =======================
// 2. Sistema de rutas manual
// =======================
export class Router {
	constructor() {
		this.routes = {
			GET: [],
			POST: [],
			PUT: [],
			DELETE: [],
			STATIC: [],
		};
		this.middlewares = [];
	}

	use(handler) {
		if (typeof handler !== "function") {
			throw new Error(
				"Invalid usage of use middleware (handler must be a function)",
			);
		}
		this.middlewares.push(handler);
	}

	set(method, route, handler) {
		// Si existe el method
		if (Object.keys(this.routes).includes(method)) {
			// Y si no está ya registrado la misma ruta
			if (
				Array.from(this.routes[method]).findIndex(
					(item) => item.path === route,
				) === -1
			)
				this.routes[method].push({ path: route, handler }); // agrego la ruta
		}
	}

	get(route, handler) {
		this.set("GET", route, handler);
	}
	post(route, handler) {
		this.set("POST", route, handler);
	}
	put(route, handler) {
		this.set("PUT", route, handler);
	}
	delete(route, handler) {
		this.set("DELETE", route, handler);
	}

	all(route, handler) {
		this.get(route, handler);
		this.post(route, handler);
		this.put(route, handler);
		this.delete(route, handler);
	}

	get_static(pathname){
		return serveStatic(pathname);
	}
	use_static(pathname){
		this.use(this.get_static(pathname))
	}

	// Middleware que ejecuta las rutas
	middleware(req, res) {
		const parsedUrl = url.parse(req.url, true);
		const { pathname } = parsedUrl;
		const method = req.method;
		let route_result = true;

		// Execute all middlewares
		for (let idx = 0; idx < this.middlewares.length; idx++) {
			const clbk = this.middlewares[idx];
			const result = clbk(req, res, () => {});
			if (result) {
				break;
			}
		}

		const routeFilter = (route) => {
			const regex = this._pathToRegExp(route.path);
			return regex.pattern.test(pathname);
		};
		// Buscar ruta coincidente
		let matchedRoute = this.routes[method].find(routeFilter);

		// Si no se encuentra en el method del request, revisar en la STATIC
		if (!matchedRoute) {
			matchedRoute = this.routes["STATIC"].find(routeFilter);
		}

		if (matchedRoute) {
			const params = this._extractParams(matchedRoute.path, pathname);
			req.params = params;
			req.matchedRoutePath = matchedRoute.path;
			const nextCall = matchedRoute.handler(req, res, () => {});
			route_result &= typeof nextCall === "boolean" ? nextCall : true;
		} else {
			route_result &= false; // not found route (call to next)
		}

		return route_result;
	}

	// Convierte rutas como /user/:id a expresiones regulares
	_pathToRegExp(path) {
		const keys = [];
		const pattern = path
			.replace(/\/:([^\/]+)/g, (_, key) => {
				keys.push(key);
				return "/([^/]+)";
			})
			.replace(/\*/g, ".*");
		return { pattern: new RegExp(`^${pattern}$`), keys };
	}

	// Extrae parámetros de la URL (ej: /user/123 → { id: '123' })
	_extractParams(routePath, actualPath) {
		const { pattern, keys } = this._pathToRegExp(routePath);
		const matches = actualPath.match(pattern);
		if (!matches || keys.length === 0) return {};
		return keys.reduce((params, key, i) => {
			params[key] = matches[i + 1];
			return params;
		}, {});
	}
}

export default function router() {
	return new Router();
}
