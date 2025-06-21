
/**
 * Verifica que dos arrays sean iguales o no
 * @param {Array} arr1 Array a la izquierda de la comparación
 * @param {Array} arr2 Array a la derecha de la comparación
 */
export function compareArrays(arr1, arr2) {
	// Si son la misma referencia, retorna true
	if (arr1 === arr2) return true;
	// Si sus longitudes son iguales
	if (arr1.length === arr2.length)
	// Por cada elemento del arr1
		for (const a of arr1) {
			// Verificar que existe en arr2
			if (!arr2.includes(a)) return false;
		}
	return true;
}

