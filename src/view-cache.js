import { promises as fs } from 'fs';
import path from 'path';
import { LRUCache } from './lru.js';


/**
 * @typedef {Object} CacheEngineOptions
 * @property {string} [viewsDirectory='./views'] - Directory for view files
 * @property {number} [cacheSize=100] - Maximum number of files to cache (LRU)
 * @property {boolean} [isProduction=false] - Production mode flag (enables caching)
 */

/**
 * Crea un middleware que inyecta todas las peticiones entrantes con las funciones
 * de caching
 * @param {CacheEngineOptions} options Objeto con opciones para crear el middleware de cache
 * @returns middleware que inyectará en todas las peticiones las funciones de caché
 */
export function cacheEngine(options = {}) {
	const config = {
		viewsDirectory: path.resolve(options.viewsDirectory || './views'),
		cacheSize: options.cacheSize || 100,
		isProduction: options.isProduction ?? process.env.NODE_ENV === 'production',
	};

	// Cache structures
	const templateCache = new LRUCache(config.cacheSize);

	/**
	 * Retorna el contenido de un fichero con cache de intermedio en modo producción
	 * @param {string} filePath - file path relativo
	 * @returns {Promise<string>} contenido del fichero
	 */
	async function getViewContent(filePath) {
		const filePathResolved = path.resolve(path.join(config.viewsDirectory, filePath));
		try {
			// Verifica que el archivo existe y obtener sus atributos
			const stats = await fs.stat(filePathResolved);

			// En el modo de producción, verificar la cache
			if (config.isProduction && templateCache.has(filePathResolved)) {
				const cached = templateCache.get(filePathResolved);

				// Valida la cache
				if (cached.mtime >= stats.mtime) {
					return cached.content;
				} else {
					// El archivo a cambiado, borrar cache
					templateCache.cache.delete(filePathResolved);
				}
			}

			// Leer el contenido del fichero
			const content = await fs.readFile(filePathResolved, 'utf-8');

			// El contenido del cache, con metadatos
			const cacheEntry = {
				content,
				mtime: stats.mtime,
				size: content.length
			};

			if (config.cacheSize > 0) {
				templateCache.set(filePathResolved, cacheEntry);
			}

			return content;

		} catch (err) {
			if (err.code === 'ENOENT') {
				throw new Error(`View file not found: ${filePath} (${filePathResolved})`);
			}
			throw err;
		}
	}

	/**
	 * Mejorado el error handling con el contexto
	 * @param {Error} error - The error object
	 * @param {Object} res - Response object
	 * @param {Function} next - Next middleware function
	 * @param {string} context - Error context
	 */
	function handleError(error, res, next, context = 'render') {
		const errorMessage = `Cache Engine ${context} error: ${error.message}`;
		console.error(errorMessage, {
			stack: error.stack,
			timestamp: new Date().toISOString()
		});

		if (next && typeof next === 'function') {
			return next(error);
		}

		if (!res.headersSent) {
			res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
			res.end('Internal Server Error');
		}
	}

	/**
	 * El middleware que será el responsable de inyectar las funciones de caching
	 * @param {Request} req Información de la petición web
	 * @param {Response} res Información de la respuesta
	 * @param {Function} next Siguiente handler a llamar
	 * @returns {null} retorna null o lo que retorne el next callback en caso de ya estar instalado
	 */
	function cacheEngineMiddleware(req, res, next) {
		// Prevenir multiples llamadas al middleware
		if (res.webeactViewContent) {
			return next();
		}

		/**
		 * Renderizar una view y enviarla al cliente
		 * @param {string} viewPath - Relative path to the view file
		 * @returns {Promise<void>}
		 */
		res.sendComponent = async (viewPath) => {
			try {
				const html = await getViewContent(viewPath);
				res.setHeader('Content-Type', 'text/html; charset=utf-8');
				res.setHeader('Content-Length', Buffer.byteLength(html, 'utf-8'));

				if (res.send) {
					res.send(html);
				} else {
					res.end(html);
				}
			} catch (err) {
				handleError(err, res, next, 'renderComponent');
			}
		};

		/**
		 * Obtener el contenido de un archivo
		 */
		res.webeactViewContent = (...args) => {
			return getViewContent(...args)
		};

		/**
		 * Borrar la cache
		 */
		res.clearCache = () => {
			templateCache.clear();
		};

		next();
	}

	return cacheEngineMiddleware;
}

export default cacheEngine;
