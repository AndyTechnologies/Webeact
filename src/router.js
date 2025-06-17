import url from "url";
import path from "path";
import { promises as fs, createReadStream } from "fs";;

// Mapa de tipos MIME reutilizable
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

	return async (req, res) => {
		try {
			const pathname = path.resolve(parseURL(req));
			const filePath = path.resolve(sanitizePath(pathname, absRoot));

			if (!filePath.startsWith(absRoot + path.sep)) {
				console.warn("[403] Forbidden path: " + filePath);
				return false;
			}

			let stats;
			try {
				stats = await fs.stat(filePath);
			} catch (err) {
				if (err.code === "ENOENT") return false;
				throw err;
			}

			if (!stats.isFile()) {
				console.warn("[400] Not a file: " + filePath);
				return false;
			}

			const ext = path.extname(filePath).toLowerCase();
			const contentType = mimeTypes[ext] || "application/octet-stream";

			// Headers optimizados con cache y tamaño
			const headers = {
				'Content-Type': contentType,
				'Content-Length': stats.size,
				'Last-Modified': stats.mtime.toUTCString(),
				'Cache-Control': 'public, max-age=3600', // Cache por 1 hora
				'ETag': `"${stats.mtime.getTime()}-${stats.size}"` // ETag simple basado en mtime y tamaño
			};

			const ifNoneMatch = req.headers['if-none-match'];
			if (ifNoneMatch && ifNoneMatch === headers.ETag) {
				res.writeHead(304, { 'ETag': headers.ETag });
				res.end();
				return true;
			}

			// Verificar If-Modified-Since
			const ifModifiedSince = req.headers['if-modified-since'];
			if (ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime) {
				res.writeHead(304, {
					'Last-Modified': headers['Last-Modified'],
					'ETag': headers.ETag
				});
				res.end();
				return true;
			}

			// Configurar headers de respuesta
			res.writeHead(200, headers);

			// Stream del archivo con manejo de errores mejorado
			const stream = createReadStream(filePath);

			stream.on("error", (streamErr) => {
				console.error('Stream error:', streamErr);

				// Solo enviar respuesta de error si no se han enviado headers
				if (!res.headersSent) {
					res.writeHead(500, { 'Content-Type': 'text/plain' });
					res.end('Internal Server Error');
				} else {
					// Si ya se enviaron headers, solo cerrar la conexión
					res.destroy();
				}
			});

			// Manejar cuando el cliente cierra la conexión
			req.on('close', () => {
				if (!stream.destroyed) {
					stream.destroy();
				}
			});

			// Pipe del stream al response
			stream.pipe(res);

			return true;
		} catch (error) {
			console.error('Error serving static file:', error);

			if (!res.headersSent) {
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				res.end('Internal Server Error');
			}

			return false;
		}
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
	async middleware(req, res) {
		const parsedUrl = url.parse(req.url, true);
		const { pathname } = parsedUrl;
		const method = req.method;
		let route_result = true;

		// Execute all middlewares
		for (let idx = 0; idx < this.middlewares.length; idx++) {
			const clbk = this.middlewares[idx];
			const result = await clbk(req, res, () => {});
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
			.replace(/\/:([^/]+)/g, (_, key) => {
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
