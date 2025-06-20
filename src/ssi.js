import { promises as fs } from 'fs';
import path from 'path';

/**
 * Reemplaza las directivas <import-file src="..."> con el contenido correspondiente.
 *
 * @param {string} html - Contenido HTML original.
 * @param {string} baseDir - Directorio base para resolver las rutas.
 * @returns {Promise<string>}
 */
export async function processImports(html, baseDir) {
	const importRegex = /<import-file\s+src=["'](.+?)["']\s*\/?>/g;
	let match;
	let result = html;

	while ((match = importRegex.exec(html)) !== null) {
		const importPath = match[1];
		const resolvedPath = path.join(baseDir, importPath);
		let replacement = '';

		try {
			// Verifica que el archivo existe y obtener sus atributos
			const stats = await fs.stat(resolvedPath);
			if( stats.isFile() ){
				replacement = await fs.readFile(resolvedPath, 'utf-8');
				// Procesar imports anidados
				replacement = await processImports(replacement, path.dirname(resolvedPath));
			} else {
				console.warn(`[SSI] Archivo no encontrado: ${resolvedPath}`);
			}
		} catch (err) {
			console.warn(`[SSI] Error leyendo archivo: ${resolvedPath}\n${err.message}`);
		}

		result = result.replace(match[0], replacement);
	}

	return result;
}
