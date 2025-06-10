/**
 * Template Engine Middleware
 * --------------------------
 * Simple, dependency-free template engine.
 * Supports {{variable}} interpolation, optional streaming and caching.
 */

import * as fs from "fs";
import path from "path";
import { Transform } from "stream";

/**
 * @typedef {Object} TemplateEngineOptions
 * @property {string} [viewsDirectory='./views'] - Directory for template files
 * @property {number} [cacheSize=100] - Maximum number of compiled templates to cache
 * @property {boolean} [isProduction=false] - Production mode flag (enables caching)
 * @property {Object} [helpers] - Global helper functions available in templates
 * @property {boolean} [streaming=false] - Enable streaming for large responses
 */

export function templateEngine(options = {}) {
	const config = {
		viewsDirectory: path.resolve(options.viewsDirectory || "./views"),
		cacheSize: options.cacheSize || 100,
		isProduction: options.isProduction ?? process.env.NODE_ENV === "production",
		helpers: options.helpers || {},
		streaming: options.streaming || false,
	};

	// In-memory cache: Map<filePath, renderFunction>
	const templateCache = new Map();

	/**
	 * Compile a template into a render function: (data, helpers) => string
	 * @param {string} templatePath - Template file relative path
	 * @returns {(data: Object, helpers: Object) => string}
	 */
	function compileTemplate(templatePath) {
		const filePath = path.join(config.viewsDirectory, templatePath);

		// Return cached in production or when cache fills
		if (config.isProduction && templateCache.has(filePath)) {
			return templateCache.get(filePath);
		}

		const template = fs.readFileSync(filePath, "utf-8");

		// Tokenize: split static text and {{ expression }}
		const tokenRegex = /{{\s*([^{}]+?)\s*}}/g;
		let lastIndex = 0;
		const parts = [];
		let match;
		while ((match = tokenRegex.exec(template)) !== null) {
			if (match.index > lastIndex) {
				parts.push(["text", template.slice(lastIndex, match.index)]);
			}
			parts.push(["expr", match[1].trim()]);
			lastIndex = tokenRegex.lastIndex;
		}
		if (lastIndex < template.length) {
			parts.push(["text", template.slice(lastIndex)]);
		}

		// Build function body
		let fnBody = [];
		fnBody.push("// Internal eval helper for expressions");
		fnBody.push("const __eval = expr => {");
		fnBody.push(
			'  try { return Function("with(this) return (" + expr + ");").call(data); }',
		);
		fnBody.push('  catch { return ""; }');
		fnBody.push("};");
		fnBody.push('let __out = "";');

		for (const [type, content] of parts) {
			if (type === "text") {
				// Safely append literal text
				fnBody.push(`__out += ${JSON.stringify(content)};`);
			} else {
				// Evaluate expression against data and helpers
				fnBody.push(`__out += __eval( \`${content}\` );`);
			}
		}
		fnBody.push("return __out;");

		// Create render function(data, helpers)
		const renderFn = new Function("data", "helpers", fnBody.join("\n"));

		// Cache if configured
		if (config.cacheSize > 0) {
			if (templateCache.size >= config.cacheSize) {
				const firstKey = templateCache.keys().next().value;
				templateCache.delete(firstKey);
			}
			templateCache.set(filePath, renderFn);
		}

		return renderFn;
	}

	/**
	 * Middleware that injects res.render
	 */
	return function templateEngineMiddleware(req, res, next) {
		if (!res.renderComponent) {
			/**
			 * Render a view with data
			 * @param {string} viewPath - Template file relative to viewsDirectory
			 * @param {Object} [data] - Data for template
			 */
			res.renderComponent = (viewPath, data = {}) => {
				try {
					const render = compileTemplate(viewPath);
					const html = render({ ...data }, config.helpers);

					// Choose streaming or direct
					if (config.streaming && html.length > 32 * 1024) {
						streamResponse(html, res);
					} else {
						res.setHeader("Content-Type", "text/html; charset=utf-8");
						res.send(html);
					}
				} catch (err) {
					handleError(err, res, next);
				}
			};
		}
		return false; // not break
	};

	/**
	 * Stream large HTML in chunks
	 */
	function streamResponse(html, res) {
		const transformer = new Transform({
			transform(chunk, _, cb) {
				cb(null, chunk);
			},
		});
		transformer.pipe(res);
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		const chunkSize = 16 * 1024;
		for (let i = 0; i < html.length; i += chunkSize) {
			transformer.write(html.slice(i, i + chunkSize));
		}
		transformer.end();
	}

	/**
	 * Handle rendering errors gracefully
	 */
	function handleError(error, res, next) {
		if (next) return next(error);
		console.error("Render error:", error);
		res.writeHead(500, { "Content-Type": "text/plain" });
		res.end("Internal Server Error");
	}
}

export default templateEngine;
