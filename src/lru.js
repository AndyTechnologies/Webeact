/**
 * Un LRU Cache (Least Recently Used Cache)
 * Una estructura de caché que guarda un número limitado de elementos
 * Y elimina automáticamente el menos recientemente usado cuando se alcanza
 * Su capacidad máxima.
 */
export class LRUCache {
	/**
     * Crea una instancia del Cache
     * @param {number} maxSize El tamaño máximo de la cache
     */
	constructor(maxSize) {
		this.maxSize = maxSize;
		this.cache = new Map();
	}

	/**
     * Retorna el valor asociado a la llave pasada
     * @param {string} key La llave asociada a la entrada del cache
     * @returns {any|null} el valor asociado a la llave en el cache, o null en caso de no existir
     */
	get(key) {
		if (this.cache.has(key)) {
			// Move to end (most recently used)
			const value = this.cache.get(key);
			this.cache.delete(key);
			this.cache.set(key, value);
			return value;
		}
		return null;
	}

	/**
     * Guarda en cache un valor asociándolo a una llave
     * @param {string} key la llave a la que se asocia ese valor en el LRU
     * @param {*} value el valor que se guarda en cache
     */
	set(key, value) {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			// Remove least recently used (first item)
			const firstKey = this.cache.keys().next().value;
			this.cache.delete(firstKey);
		}
		this.cache.set(key, value);
	}

	/**
     * Si existe un valor asociado a una llave o no
     * @param {string} key la llave que se verifica si existe
     * @returns {boolean} true en caso de existir un valor asociado a esa llave
     */
	has(key) {
		return this.cache.has(key);
	}

	/**
     * Borra todos los elementos de la cache
     */
	clear() {
		this.cache.clear();
	}

	/**
     * Retorna la cantidad de valores que están en la cache
     */
	get size() {
		return this.cache.size;
	}
}
