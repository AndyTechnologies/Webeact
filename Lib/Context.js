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
		// Nombre para el Context (TODO: para poder guardar estados en el localStorage)
		this._contextName = `webeact-ctx-${cmpName}-${Context.idx++}`;
		// Callbacks para ejecutarse cuando se actualice el estado de un atributo
		this.dynamicCallbacks = new Map();
		// Almacena los estados por orden
		this.states = [];
		// Effects (hook para ejecutar una función cuando cambia un estado)
		this.effects = [];
		// Índice actual para los hooks
		this.hookIndex = 0;

		// Binding del Contexto
		this.callbacks = {
			registerDynamicCallback: this.registerDynamicCallback.bind(this),
			unregisterDynamicCallback: this.unregisterDynamicCallback.bind(this),
			/* Hooks */
			useState: this.useState.bind(this),
			useEffect: this.useEffect.bind(this),
			useViewTransition: this.useViewTransition.bind(this),
			useSSE: this.useSSE.bind(this)
		};
		// Callback para actualizar el DOM
		this._render = renderCallback;
		// Callback para obtener los atributos
		this.getAttribute = getAttr;
		// Callback para verificar si un atributo existe
		this.hasAttribute = hasAttr;
	}

	/**
	 * Verificar si existe una función asociada a un atributo
	 * @param {string} key atributo al que debe de estar registrado
	 * @param {Function} callback callback a revisar si está registrado
	 * @returns {boolean} si existe o no el registro de la función dinámica al atributo
	 */
	existsDynamicCallback(key, callback){
		if (this.dynamicCallbacks.has(key)) {
			const dc = this.dynamicCallbacks.get(key);
			for (let i=0; i < dc.length; i++){
				if (`${dc[i].handler}` === `${callback}`) return true;
			}
		}
		return false;
	}

	/**
	 * Registrar una funcion que se ejecutará cuando se actualice
	 * el estado de un atributo o slot
	 * @param {string} key atributo al cuál registrar el callback
	 * @param {Function} callback función que se ejecutará cada vez que cambie el valor del atributo
	 * @param {*} metadata metadatos que se van a pasar cómo parámetros a la función
	 * @param {boolean} ensureNoDuplicates si se debe verificar que el callback existe antes de registrarlo
	 */
	registerDynamicCallback(key, callback, metadata = null, ensureNoDuplicates = true) {
		if (!(ensureNoDuplicates && this.existsDynamicCallback(key, callback)) ){
			// Callbacks copy (if not exist create new)
			const callbacks = Array.from(this.dynamicCallbacks.get(key) || []);
			// oldData a null para siempre procesar una vez los attrs
			callbacks.push({
				handler: callback,
				metadata: { oldData: null, ...metadata }
			});

			this.dynamicCallbacks = this.dynamicCallbacks.set(key, callbacks);
		}
	}

	/**
	 * Quitar una funcion que se había registrado
	 * para ejecutarse cuando se actualice el estado
	 * de un atributo
	 * @param {string} key atributo al que se le quiere quitar el callback
	 * @param {Function} callback función a ser quitada del registro
	 */
	unregisterDynamicCallback(key, callback) {
		if (this.dynamicCallbacks.has(key)) {
			const callbacks = this.dynamicCallbacks.get(key).filter(
				item => item.handler === callback // quitar los callbacks iguales
			);
			this.dynamicCallbacks = this.dynamicCallbacks.set(key, callbacks);
		}
	}

	/**
	 * Crea una view transition para una actualización
	 * dinámica de elementos por updateUI
	 * @param {Function} updateUI función que va a actualizar la UI
	 * @param {Function} readyCallback función que será llamada cuando la transición termine con éxito (si falla no)
	 * @param {Function} finishedCallback función que será llamada cuando la transición termine
	 * @returns {ViewTransition} el objeto ViewTransition creado
	 */
	useViewTransition(updateUI, readyCallback = __ignoreCallback, finishedCallback = __ignoreCallback) {
		const transition = document.startViewTransition(updateUI);
		transition.ready.then(readyCallback)
		transition.finished.then(finishedCallback)
		return transition;
	}

	/**
	 * Crea un escucha para Server-Side-Events
	 * @param {string} source URL desde dónde se envían los eventos
	 * @param {Function} onMessage función que se llamará para los eventos sin nombre
	 * @param {Function} onError función que se llamará cuando ocurra un error
	 * @param {Object} customsEvents objeto con los eventos personalizados (debe ser un objeto donde las key sean el nombre del evento y el valor su callback)
	 * @returns {EventSource} el objeto EventSource creado
	 */
	useSSE(source, onMessage, onError, customsEvents = {}) {
		const eventSource = new EventSource(source);
		eventSource.onmessage = onMessage;
		eventSource.onerror = onError;
		// Registrar todos los customs events
		Object.entries(customsEvents).forEach((event, clbk) => eventSource.addEventListener(event, clbk))
		return eventSource;
	}

	/**
	 * Hook para que una función se ejecute 1 vez (la primera vez)
	 * y después solo cuando cambien sus params
	 * @param {*} callback Función que se ejecuta
	 * @param {*} params Dependencias para que se re-ejecute la función
	 */
	useEffect(callback, params) {
		// 1. Obtener el índice actual y avanzar el contador
		const currentIndex = this.hookIndex++;
		const oldEffect = Array.from(this.effects[currentIndex] || []);

		// 2. Si los params son iguales o no
		let areEquals = (oldEffect[1] && oldEffect[1].length === params.length);

		// 3. Verificar que todos los parámetros sean iguales.
		const [, oldParams] = oldEffect;
		for (let i = 0; (i < oldParams?.length) && areEquals; i++)
			areEquals = Object.is(oldParams[i], params[i]);

		// 4. Si hay diferencias de parámetros, se actualizan los callbacks
		if(!areEquals){
			this.effects[currentIndex] = [callback, params];
			callback(...params);
		}
	}

	/**
	 * Hook para tener un estado reactivo que cuando cambie
	 * desencadenará un re-renderizado
	 * @param {*} initialValue Valor inicial para el estado
	 * @returns {Array} primer valor del array es el valor actual del estado, y el segundo es la función que se usa para actualizar el valor del estado y desencadenar el re-renderizado
	 */
	useState(initialValue) {
		// 1. Obtener el índice actual y avanzar el contador
		const currentIndex = this.hookIndex++;

		// 2. Inicializar el estado si no está definido
		if (this.states[currentIndex] === undefined) {
			this.states[currentIndex] = initialValue;
		}

		// 3. Crear función setter
		const setState = (newValue) => {
			// 3.1 Obtener el estado que ya está para evitar accesos innecesarios a memoria
			const oldState = this.states[currentIndex];
			// 4. Obtener el valor actual (soportando funciones)
			const value = typeof newValue === 'function'
				? newValue(oldState)
				: newValue;

			// 5. Solo actualizar si el valor cambia
			if (!Object.is(oldState, value)) {
				// 6. Actualizar estado
				this.states[currentIndex] = value;

				// 7. Programar re-renderizado
				if (this._render) this._render();
			}
		};

		return [this.states[currentIndex], setState];
	}
}
