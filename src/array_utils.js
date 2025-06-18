
/**
 * Retorna los elementos de diferencia entre el arr1 y el arr2
 * @param {Array} arr1 Array a la izquierda de la comparación
 * @param {Array} arr2 Array a la derecha de la comparación
 * @returns {Array} Elementos que están en el arr1 y no en el arr2
 */
export function diffArray(arr1, arr2) {
	return arr1.filter(v => { return !arr2.includes(v) });
}

/**
 * Verifica que dos arrays sean iguales o no
 * @param {Array} arr1 Array a la izquierda de la comparación
 * @param {Array} arr2 Array a la derecha de la comparación
 */
export function areEquals(arr1, arr2) {
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
