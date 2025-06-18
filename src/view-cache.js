/**
 * Cache Engine Middleware for Views
 * --------------------------
 * Simple, dependency-free cache engine.
 * Supports optional streaming and caching.
 * Adds prefetching of dependencies: <link>, <script>, <img>.
 */
import { promises as fs, statSync } from 'fs';
import path from 'path';
import { LRUCache } from './lru.js';

const PATTERNS = {
	htmlPatterns: [
		// HTML includes: <!-- include "file.html" -->
		/<!--\s*include\s+["']([^"']+)["']\s*-->/gi,
		// Import statements: @import "file.html"
		/@import\s+["']([^"']+)["']/gi,

		// CSS files
		/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi,

		// JavaScript files
		/<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi,
		/<script[^>]+src=["']([^"']+\.mjs[^"']*)["']/gi,

		// Images
		/<img[^>]+src=["']([^"']+\.(jpg|jpeg|png|gif|svg|webp|ico)[^"']*)["']/gi,

		// Background images in style attributes
		/style=["'][^"']*background-image:\s*url\(["']?([^"')]+)["']?\)/gi,

		// Favicon and icons
		/<link[^>]+rel=["'](icon|shortcut icon|apple-touch-icon)[^>]+href=["']([^"']+)["']/gi,

		// Fonts
		/<link[^>]+href=["']([^"']+\.(woff|woff2|ttf|eot|otf)[^"']*)["']/gi,

		// Audio/Video
		/<(?:audio|video)[^>]+src=["']([^"']+)["']/gi,
		/<source[^>]+src=["']([^"']+)["']/gi,

		// Object/embed
		/<(?:object|embed)[^>]+(?:src|data)=["']([^"']+)["']/gi,

		// Manifest files
		/<link[^>]+rel=["']manifest["'][^>]+href=["']([^"']+)["']/gi,
	],
}


/**
 * @typedef {Object} CacheEngineOptions
 * @property {string} [viewsDirectory='./views'] - Directory for view files
 * @property {number} [cacheSize=100] - Maximum number of files to cache (LRU)
 * @property {boolean} [isProduction=false] - Production mode flag (enables caching)
 * @property {boolean} [prefetchDependencies=true] - Enable automatic dependency pre-fetching
 * @property {number} [prefetchDepth=2] - Maximum depth for dependency scanning
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
		prefetchDependencies: options.prefetchDependencies !== false,
		prefetchDepth: options.prefetchDepth || 2,
	};

	// Cache structures
	const templateCache = new LRUCache(config.cacheSize);
	const dependencyGraph = new Map(); // filePath -> Set<dependencyPaths>
	const reverseGraph = new Map();    // dependencyPath -> Set<parentPaths>

	/**
   * Extrae todas las dependencias desde el contenido
   * @param {string} content - Contenido a escanear
   * @param {string} basePath - Directorio base desde el que se resuelven las rutas relativas
   * @returns {Set<string>} Set de los nombres de archivos de los que depende el content
   */
	function extractDependencies(content, basePath) {
		const dependencies = new Set();

		// dependency patterns
		const { htmlPatterns } = PATTERNS;

		let patternsToUse = htmlPatterns;

		// Extraer dependencias en función de los regexs
		patternsToUse.forEach(pattern => {
			let match;
			while ((match = pattern.exec(content)) !== null) {
				// Obtener la URL
				let depPath = match[1] || match[2];

				if (depPath && !isExternalUrl(depPath)) {
					try {
						const resolvedPath = resolveAssetPath(depPath, basePath);
						if (resolvedPath) {
							dependencies.add(resolvedPath);
						}
					} catch (err) {
						console.warn(`Failed to resolve dependency: ${depPath}`, err.message);
					}
				}
			}
		});

		return dependencies;
	}

	/**
   * Check if a URL is external (HTTP/HTTPS/protocol-relative)
   * @param {string} url - URL to check
   * @returns {boolean} True if external
   */
	function isExternalUrl(url) {
		return /^(https?:)?\/\/|^data:|^blob:|^mailto:|^tel:/.test(url);
	}

	/**
   * Resuelve el path de un asset probando baseDirs preDefinidos
   * @param {string} assetPath - el path del asset a resolver
   * @param {string} basePath - indicar el base dir path
   * @returns {string|null} Resolved absolute path or null if invalid
   */
	function resolveAssetPath(assetPath, basePath) {
		try {
			// Manejar viewsDirectory relative paths (/assets/...)
			if (assetPath.startsWith('/')) {
				// Assume project root or public directory
				const projectRoot = path.dirname(config.viewsDirectory);
				const publicPath = path.join(projectRoot, 'public', assetPath.substring(1));
				const staticPath = path.join(projectRoot, 'static', assetPath.substring(1));
				const assetsPath = path.join(projectRoot, 'assets', assetPath.substring(1));

				// Try different common asset directories
				for (const tryPath of [publicPath, staticPath, assetsPath]) {
					try {
						statSync(tryPath);
						return tryPath;
					} catch {
						continue;
					}
				}
				return null;
			}

			// Manejar paths relativos (no al ViewsDirectory)
			const resolvedPath = path.resolve(basePath, assetPath);

			// Verify file exists
			try {
				statSync(resolvedPath);
				return resolvedPath;
			} catch {
				return null;
			}
		} catch (err) {
			console.error(`Error resolving Asset Path: ${err}`);
			return null;
		}
	}

	/**
   * Refrescar el grafo de dependencias para un archiv
   * @param {string} filePath - El path del fichero
   * @param {string} content - El contenido del fichero
   */
	function updateDependencyGraph(filePath, content) {
		const basePath = path.dirname(filePath);
		const fileExtension = path.extname(filePath).toLowerCase();
		const dependencies = extractDependencies(content, basePath, fileExtension);

		// Borrar las dependencias antiguas del grafo para revertir
		if (dependencyGraph.has(filePath)) {
			const oldDeps = dependencyGraph.get(filePath);
			oldDeps.forEach(dep => {
				if (reverseGraph.has(dep)) {
					reverseGraph.get(dep).delete(filePath);
					if (reverseGraph.get(dep).size === 0) {
						reverseGraph.delete(dep);
					}
				}
			});
		}

		// Refrescar las dependencias para este archivo en el grafo
		dependencyGraph.set(filePath, dependencies);

		// Refrescar las dependencias para este archivo en el grafo de revertir
		dependencies.forEach(dep => {
			if (!reverseGraph.has(dep)) {
				reverseGraph.set(dep, new Set());
			}
			reverseGraph.get(dep).add(filePath);
		});
	}

	/**
   * Invalida las entradas de la cache que dependen de un archivo cambiado
   * @param {string} changedFilePath - Ruta del archivo cambiado
   */
	function invalidateDependents(changedFilePath) {
		const dependents = reverseGraph.get(changedFilePath);
		if (dependents) {
			dependents.forEach(dependent => {
				templateCache.cache.delete(dependent);
				// Recursively invalidate dependents
				invalidateDependents(dependent);
			});
		}
	}

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
					// El archivo a cambiado, borrar cache e invalidar el grafo de dependencias
					templateCache.cache.delete(filePathResolved);
					invalidateDependents(filePathResolved);
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

			// Refrescar el grafo de dependencias
			if (config.prefetchDependencies) {
				updateDependencyGraph(filePathResolved, content);

				// Async prefetch dependencies (don't await)
				prefetchDependencies(filePathResolved).catch(err => {
					console.warn('Prefetch error:', err.message);
				});
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
   * Pre-fetch dependencias recursivamente
   * @param {string} filePath - El fichero por el que se empezará a analizar
   * @param {number} depth - profundidad del análisis
   * @param {Set<string>} visited - set de archivos visitados (para evitar ciclos en recursividad)
   */
	async function prefetchDependencies(filePath, depth = 0, visited = new Set()) {
		if (depth >= config.prefetchDepth || visited.has(filePath)) {
			return;
		}

		visited.add(filePath);
		const dependencies = dependencyGraph.get(filePath);

		if (dependencies) {
			for (const depPath of dependencies) {
				try {
					if (!templateCache.has(depPath)) {
						const content = await fs.readFile(depPath, 'utf-8');
						templateCache.set(depPath, {
							content,
							mtime: (await fs.stat(depPath)).mtime,
							size: content.length
						});

						// Refrescar el grafo de dependencias
						updateDependencyGraph(depPath, content);
					}

					// LLamar recursivamente al prefetch
					await prefetchDependencies(depPath, depth + 1, visited);
				} catch (err) {
					console.warn(`Failed to prefetch dependency: ${depPath}`, err.message);
				}
			}
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
		res.streamComponent = async (viewPath) => {
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

		res.webeactViewContent = (...args) => {
			return getViewContent(...args)
		};

		/**
		 * Clear cache (useful for development)
		 */
		res.clearCache = () => {
			templateCache.clear();
			dependencyGraph.clear();
			reverseGraph.clear();
		};

		next();
	}

	return cacheEngineMiddleware;
}

export default cacheEngine;
