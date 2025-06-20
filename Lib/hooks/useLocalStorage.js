import { Hook, HookType } from "./hookObject";

/**
* useLocalStorage
* Proporciona acceso de lectura y escritura a localStorage sin dependencias.
* @param {string} key - Clave en localStorage.
* @param {*} initialValue - Valor inicial si no existe en localStorage.
* @param {string|undefined} contextName - Nombre del contexto para diferenciarlo (opcional)
* @returns {[function(): any, function(*|function): void, function(*|function): void]} - Array con [read, write, patch] (la función patch es sólo para cuando se está trabajando con ebjetos).
*/
export function useLocalStorage(key, initialValue, contextName){
	const localStorageHook = new Hook({
		LSKey: key,
		context: contextName,
		loader: () => {
			let data = window.localStorage.getItem(contextName);
			if (data === null) {
				data = {};
				window.localStorage.setItem(contextName, JSON.stringify(data));
			} else {
				data = JSON.parse(data);
			}
			return data;
		}
	}, HookType.LocalStorageHook);

	// Inicializar valor en localStorage si no existe
	try {
		const storage = localStorageHook.get();
		let data = storage.loader();

		if (!data[storage.LSKey] && initialValue !== undefined )
		{ data[storage.LSKey] = initialValue }
		window.localStorage.setItem(storage.context, JSON.stringify(data));
	} catch (err) {
		console.warn(`useLocalStorage: no se pudo inicializar la clave "${key}":`, err);
	}

	/**
    * Leer valor de localStorage.
    * @returns {*} Valor parseado o null.
    */
	const read = () => {
		try {
			const storage = localStorageHook.get();
			const data = storage.loader();
			let item = null;
			if( data[storage.LSKey] !== undefined )
				item = data[storage.LSKey];
			return item;
		} catch (err) {
			console.warn(`useLocalStorage: error al leer la clave "${key}":`, err);
			return null;
		}
	}

	/**
     * Escribir valor en localStorage.
     * @param {*|function} value - Valor directo o función que recibe el previo y retorna el nuevo.
     */
	const write = (value) => {
		try {
			const current = read();
			const valueToStore = value instanceof Function ? value(current) : value;

			const storage = localStorageHook.get();
			const data = storage.loader();
			data[storage.LSKey] = valueToStore;
			window.localStorage.setItem(storage.context, JSON.stringify(data));
		} catch (err) {
			console.warn(`useLocalStorage: error al escribir la clave "${key}":`, err);
		}
	}

	/**
     * Actualiza solo una parte del valor del local storage (Solo funciona con objetos)
     * @param {Object|Function} updates Objecto con actualizaciones
     */
	const patch = (updates) => {
		try {
			const current = read();
			const updatesToStore = updates instanceof Function ? updates(current) : updates;
			write({...current, ...updatesToStore});
		} catch (error) {
			console.warn(`useLocalStorage: error al hacer patch a la clave "${key}":`, error);
		}
	}

	return [read, write, patch];
}

