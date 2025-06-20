import {promises as fs, readdirSync} from "fs";
import path from "path";

/**
 * Convierte un patrón glob en una expresión regular.
 *
 * @param {string} glob - El patrón glob a convertir.
 * @returns {RegExp} Una expresión regular que representa el patrón glob.
 */
export function globToRegExp(glob) {
	let regExp = "";
	for (let i = 0; i < glob.length; i++) {
		const char = glob[i];
		if (char === "*") {
			if (i + 1 < glob.length && glob[i + 1] === "*") {
				regExp += ".*";
				i++;
			} else {
				regExp += "[^/]*";
			}
		} else if (char === "?") {
			regExp += "[^/]";
		} else if ("+?^$.{}()|[]\\".includes(char)) {
			regExp += "\\" + char;
		} else {
			regExp += char;
		}
	}
	return new RegExp(`^${regExp}$`);
}

/**
 * Busca archivos recursivamente en el sistema de archivos que coincidan con un patrón glob.
 *
 * @param {string} pattern - El patrón glob a buscar.
 * @param {function} [transform=(a) => a] - Función que se le aplica a cada ruta de archivo antes de agregarla al resultado.
 * @returns {Promise<string[]>} Una lista de rutas de archivo que coinciden con el patrón.
 */
export async function globAsync(pattern, transform = (a) => a) {
	const regex = globToRegExp(pattern);
	const results = [];
	const rawResults = [];

	async function traverse(currentPath) {
		try {
			const entries = await fs.readdir(currentPath, { withFileTypes: true });
			for (const entry of entries) {
				const nextPath = path.join(currentPath, entry.name);
				const relativePath = path.relative(process.cwd(), nextPath)
					.replace(/\\/g, "/");

				if (
					regex.test(relativePath) ||
					regex.test(nextPath.replace(/\\/g, "/"))
				) {
					if (entry.isFile()) {
						results.push(transform(nextPath));
						rawResults.push(nextPath);
					}
				}

				if (entry.isDirectory()) {
					await traverse(nextPath);
				}
			}
		} catch (err) {
			console.error("Catched error:", err);
		}
	}

	await traverse(process.cwd());
	return [results, rawResults];
}

/**
 * Busca archivos recursivamente en el sistema de archivos que coincidan con un patrón glob.
 *
 * @param {string} pattern - El patrón glob a buscar.
 * @param {function} transform - Función que se le aplica al array de resultados
 * @returns {string[]} Una lista de rutas de archivo que coinciden con el patrón.
 */
export function globSync(pattern, transform = (a) => a) {
	const regex = globToRegExp(pattern);
	const results = [];

	function traverse(currentPath) {
		try {
			const entries = readdirSync(currentPath, { withFileTypes: true });
			for (const entry of entries) {
				const nextPath = path.join(currentPath, entry.name);
				const relativePath = path
					.relative(process.cwd(), nextPath)
					.replace(/\\/g, "/");
				if (
					regex.test(relativePath) ||
					regex.test(nextPath.replace(/\\/g, "/"))
				) {
					if (entry.isFile()) {
						results.push(transform(nextPath));
					}
				}
				if (entry.isDirectory()) {
					traverse(nextPath);
				}
			}
		} catch (err) {
			console.error("Catched error:", err);
		}
	}

	traverse(process.cwd());
	return results;
}

export const glob = globAsync;

export default {
	glob,
	globToRegExp,
	globSync,
	globAsync
};
