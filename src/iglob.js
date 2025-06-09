import * as fs from "fs";
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
 * @returns {string[]} Una lista de rutas de archivo que coinciden con el patrón.
 */
export function globSync(pattern) {
	const regex = globToRegExp(pattern);
	const results = [];

	function traverse(currentPath) {
		try {
			const entries = fs.readdirSync(currentPath, { withFileTypes: true });
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
						results.push(nextPath);
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

export default globSync;
