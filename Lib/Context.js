import {
	Hook,
	HOOKS
} from "./hooks";

/**
 * Función para ignorar los callbacks
 */
function __ignoreCallback(){}

/**
 * clase Context
 * Donde se implementarán toda la lógica de los hooks y utilidades
 * disponibles en los scripts de los componentes
 */
export class Context {
	// ID auto-incrementable que dará un valor único a cada context en orden de creación
	static idx = 0;

	/**
	 * Crea una nueva instancia del Context
	 * @param {string} cmpName Nombre del componente que está creando el Context
	 * @param {Function} renderCallback callback para desencadenar un re-renderizado diferido
	 * @param {Function} hasAttr consultar si el componente contiene o no un atributo
	 * @param {Function} getAttr obtener el valor de un atributo del componente
	 */
	constructor(cmpName, renderCallback, hasAttr, getAttr) {
		// id que representa a este Context
		this.id = Context.idx++;
		// Nombre para el Context
		this._contextName = `webeact-ctx-${cmpName}-${this.id}`;

		// Binding del Contexto
		this.callbacks = {
			// Importar todos los hooks
			...HOOKS,
			/* Re-Implementar Hooks */
			useState: this.useState.bind(this),
			useViewTransition: this.useViewTransition.bind(this),
			useLocalStorage: this.useLocalStorage.bind(this),
		};
		// Callback para actualizar el DOM
		this._render = renderCallback;
		// Callback para obtener los atributos
		this.getAttribute = getAttr;
		// Callback para verificar si un atributo existe
		this.hasAttribute = hasAttr;
	}

	wrap(functionForWrap) {
		return Hook.withFrame(this._contextName, functionForWrap, {});
	}

	/**
	 * Crea una view transition para una actualización
	 * dinámica de elementos por updateUI
	 * @param {Function} updateUI función que va a actualizar la UI
	 * @param {Function} readyCallback función que será llamada cuando la transición termine con éxito (si falla no)
	 * @param {Function} finishedCallback función que será llamada cuando la transición termine
	 * @returns {[function,Object]} Un array con la función para iniciar la transición y un objeto con la información del hook
	 */
	useViewTransition(updateUI, readyCallback = __ignoreCallback, finishedCallback = __ignoreCallback) {
		const [doAction, {hook}] = HOOKS.useViewTransition(updateUI, readyCallback, finishedCallback);
		return [doAction, hook];
	}

	/**
	 * Hook para tener un estado reactivo que cuando cambie
	 * desencadenará un re-renderizado
	 * @param {*} initialValue Valor inicial para el estado
	 * @param {string} storageKey Key opcional para asociar el estado a un valor del localStorage
	 * @returns {[*, function(*|function(*):*,Object)]} primer valor del array es el valor actual del estado, y el segundo es la función que se usa para actualizar el valor del estado y desencadenar el re-renderizado
	 */
	useState(initialValue, storageKey) {
		/**
		 * Si pasan una storageKey, utilizamos también el localStorage (en el contexto del componente)
		 */
		let getter = null, setter = null;
		if (storageKey !== undefined){
			[getter, setter] = this.useLocalStorage(storageKey, initialValue, this._contextName);
			initialValue = getter();
		}

		/**
		 * Registramos el nuevo Hook useState
		 */
		const [getterState, setterState, infoState] = HOOKS.useState(initialValue);

		/**
		 * Utiliza un valor (o una función que recibe el anterior valor y retorna uno nuevo) para actualizar el valor del estado
		 * @param {*|function(*):*} newValue Nuevo valor del estado
		 */
		const setState = (newValue) => {
			// Obtener el estado que ya está para evitar accesos innecesarios a memoria
			const oldState = getterState();
			// Obtener el valor actual (soportando funciones)
			const value = typeof newValue === 'function'
				? newValue(oldState)
				: newValue;

			// Solo actualizar si el valor cambia
			if (!Object.is(oldState, value)) {
				// Actualizar estado
				setterState(value);
				if(setter) setter(value);
				// Programar re-renderizado
				if (this._render) this._render();
			}
		};

		// Retornar el valor plano actual, la función para actualizar el estado, y la información del hook
		return [getterState(), setState, infoState];
	}

	/**
	 * useLocalStorage
	 * Proporciona acceso de lectura y escritura a localStorage sin dependencias.
	 * @param {string} key - Clave en localStorage.
	 * @param {*} initialValue - Valor inicial si no existe en localStorage.
	 * @returns {[function(): any, function(*|function): void, function(Object|function): void]} - Array con [read, write, patch] (la función patch es sólo para cuando se está trabajando con ebjetos).
	 */
	useLocalStorage(key, initialValue) {
		return HOOKS.useLocalStorage(key, initialValue, this._contextName);
	}

	/**
	 * useGlobalLocalStorage
	 * Proporciona acceso de lectura y escritura a localStorage sin dependencias.
	 * Puede ser accedido desde cualquier componente.
	 * @param {string} key - Clave en localStorage.
	 * @param {*} initialValue - Valor inicial si no existe en localStorage.
	 * @returns {[function(): any, function(*|function): void, function(Object|function): void]} - Array con [read, write, patch] (la función patch es sólo para cuando se está trabajando con ebjetos).
	 */
	useGlobalLocalStorage(key, initialValue) {
		return HOOKS.useLocalStorage("webeact-globals", key, initialValue);
	}

}
