import url from "url"
import path from "path"
import * as fs from "fs"

// =======================
// 1. Middleware para servir archivos estáticos
// =======================
function serveStatic(rootDir) {
	return function staticMiddleware(req, res) {
		const parsedUrl = url.parse(req.url);
		let pathname = decodeURIComponent(parsedUrl.pathname);

		// Evitar ataques de navegación de directorios
		const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
		const filePath = path.join(rootDir, safePath);
		fs.stat(filePath, (err, stats) => {
			if (err || !stats.isFile()) {
				console.error(`Processing ${req.url} to ${pathname}`);
				console.error("Root Directory:",rootDir);
				console.error("Error en el procesamiento de archivo con fs.stat:", err);
				res.writeHead(500, { "Content-Type": "text/plain" });
				return res.end("File not Found");
			}

			// MIME types básicos
			const ext = path.extname(filePath).toLowerCase();
			const mimeTypes = {
				".html": "text/html",
				".js": "text/javascript",
				".css": "text/css",
				".json": "application/json",
				".png": "image/png",
				".jpg": "image/jpeg",
				".gif": "image/gif",
				".txt": "text/plain",
				".ico": "image/x-icon",
			};
			const contentType = mimeTypes[ext] || "application/octet-stream";

			// Enviar archivo
			fs.readFile(filePath, (err, data) => {
				if (err) {
					console.error(`Error leyendo archivo: ${filePath}`, err);
					res.writeHead(500, { "Content-Type": "text/plain" });
					return res.end("Internal Server Error");
				}

				res.writeHead(200, { "Content-Type": contentType });
				res.end(data);
			});
		});
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
			STATIC: []
		};
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
				this.routes[method].push({path: route, handler}); // agrego la ruta
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

	static(route, pathname) {
		if (pathname === undefined){
			pathname = route;
			route = "/:file";
		}
		const handler = serveStatic(pathname);
		this.set("STATIC", route, handler);
	}

	// Middleware que ejecuta las rutas
	middleware(req, res) {
		const parsedUrl = url.parse(req.url, true);
		const { pathname } = parsedUrl;
		const method = req.method;

		// Buscar ruta coincidente
		let matchedRoute = this.routes[method].find((route) => {
			const regex = this._pathToRegExp(route.path);
			return regex.pattern.test(pathname);
		});

		// Si no se encuentra en el method del request, revisar en la STATIC
		if( !matchedRoute ){
			matchedRoute = this.routes["STATIC"].find((route) => {
				const regex = this._pathToRegExp(route.path);
				return regex.pattern.test(pathname);
			});
		}

		if (matchedRoute) {
			const params = this._extractParams(matchedRoute.path, pathname);
			req.params = params;
			req.matchedRoutePath = matchedRoute.path;
			const nextCall = matchedRoute.handler(req, res);
			return ((typeof nextCall) === "boolean" ? nextCall : true);
		} else {
			return false; // not found route (call to next)
		}
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
