import { Hook, HookType } from "./hookObject";

/**
 * Crea y registra un nuevo (o carga uno ya existente del Frame) de tipo State
 * @param {*} initialValue Valor con el que inicializar el estado
 * @returns {[function():*, function(*):void,Object]}
 */
export function useState(initialValue) {
	const stateHook = new Hook({
		value: initialValue,
		listeners: new Set()
	}, HookType.StateHook);

	/**
	 * Retorna el valor del estado
	 * @returns {*} Valor actual del estado
	 */
	const getValue = () => stateHook.get().value;

	/**
	 * Selecciona el nuevo valor del estado
	 * @param {*|function(*):*} newValue Valor o Función que egenera el nuevo valor del estado en caso de ser distinto del actual
	 */
	const setValue = (newValue) => {
		const currentData = stateHook.get();
		if (!currentData) return;

		const actualNewValue = typeof newValue === 'function'
			? newValue(currentData.value)
			: newValue;

		if (currentData.value !== actualNewValue) {
			stateHook.patch({ value: actualNewValue });

			currentData.listeners.forEach(listener => {
				try {
					listener(actualNewValue, currentData.value);
				} catch (error) {
					console.error('Error in state listener:', error);
				}
			});
		}
	};

	/**
	 * Suscribe una función a los cambios del estado.
	 * @param {function(*):void} callback El listener que va a escuchar los cambios en el estado
	 * @returns {function} función cleaner
	 */
	const subscribe = (callback) => {
		const currentData = stateHook.get();
		if (currentData) {
			currentData.listeners.add(callback);
			return () => {
				const data = stateHook.get();
				if (data) data.listeners.delete(callback);
			};
		}
		return () => {};
	};

	return [getValue, setValue, { subscribe, hookInstance: stateHook }];
}

