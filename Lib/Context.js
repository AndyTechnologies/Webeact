import Signals from './Signals.js';
export class Context{
	constructor(renderCallback, hasAttr, getAttr){
		// Necesarios para el Context

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
			useSSE: this.useSSE.bind(this),
			// TC39/Proposal Signals Implementation
			Signals
		};
		// Callback para actualizar el DOM
		this._render = renderCallback;
		// Callback para obtener los atributos
		this.getAttribute = getAttr;
		// Callback para verificar si un atributo existe
		this.hasAttribute = hasAttr;
	}

	// Registrar una funcion que se ejecutará cuando se actualice el estado
	// de un atributo o slot
	registerDynamicCallback(key, callback, metadata = null, ensureNoDuplicates = true) {

		if (ensureNoDuplicates){
			this.unregisterDynamicCallback(key, callback); // no duplicates
		}

		if (!this.dynamicCallbacks.has(key)) {
			  this.dynamicCallbacks.set(key, []);
		}

		this.dynamicCallbacks.get(key).push({
			callback,
			metadata,
			oldData: this.hasAttribute(key) ? this.getAttribute(key) : null
		});
	}

	// Quitar una funcion que se había registrado para ejecutarse cuando se actualice el estado
	// de un atributo o slot
	unregisterDynamicCallback(key, callback) {
		if (this.dynamicCallbacks.has(key)) {
			const callbacks = this.dynamicCallbacks.get(key).filter(
			    item => item.callback === callback // quitar los callbacks iguales
			  );
			  this.dynamicCallbacks.set(key, callbacks);
		}
	}

	// Crea una view transition para una actualización dinámica de elementos por updateUI
	useViewTransition(updateUI, readyCallback = () => {}, finishedCallback = () => {}) {
		const transition = document.startViewTransition(updateUI);
		transition.ready.then(readyCallback)
		transition.finished.then(finishedCallback)
		return transition;
	}

	// Crea un escucha para Server-Side-Events
	// (Custom-Events debe ser un objeto donde las key sean el nombre del evento y el valor su callback)
	useSSE(source, onMessage, onError, customsEvents = {}) {
		const eventSource = new EventSource(source);
		eventSource.onmessage = onMessage;
		eventSource.onerror = onError;
		// Registrar todos los customs events
		Object.entries(customsEvents).forEach((event,clbk) => eventSource.addEventListener(event, clbk))
		return eventSource;
	}

	// Hook para que una función se ejecute 1 vez (la primera vez)
	// y después solo cuando cambien sus params
	useEffect(callback, params) {
		let areEquals = true; // Si los params son iguales o no

		// 1. Obtener el índice actual y avanzar el contador
	  const currentIndex = this.hookIndex++;

		// 2. Verificar si el callback ya existe
		if(!this.effects[currentIndex]){
			areEquals = false // se ejecutará porque no existe
		}else{
			// 3. Verificar si los params son iguales
			const [,oldParams] = Array.from(this.effects[currentIndex]);
			if (oldParams.length !== params.length) // longitudes distintas para evitar bucles
			// 4. Si no son iguales, se ejecutará porque los params son diferentes
				areEquals = false;
			// 5. Sino verificar si los params son iguales uno a uno (mas costoso)
			else for (let i = 0; i < oldParams.length; i++) {
				    if (!Object.is(oldParams[i], params[i])) {
					areEquals = false; break; // Una vez un parametro ha cambiado, se vuelve a ejecutar
				    }
				  }
		}

		// Si los params son iguales, no se ejecutará
		if(!areEquals){
			this.effects[currentIndex] = [callback, params];
			callback(...params);
		}
	}

	// Hook para tener un estado reactivo que cuando cambie desencadenará un re-renderizado
	useState(initialValue) {
		// 1. Obtener el índice actual y avanzar el contador
	  const currentIndex = this.hookIndex++;

	  // 2. Inicializar el estado si no está definido
	  if (this.states[currentIndex] === undefined) {
	    this.states[currentIndex] = initialValue;
	  }

		// 3. Crear función setter
		const setState = (newValue) => {
			// 4. Obtener el valor actual (soportando funciones)
			const value = typeof newValue === 'function'
	      ? newValue(this.states[currentIndex])
	      : newValue;

	    // 5. Solo actualizar si el valor cambia
	    if (Object.is(this.states[currentIndex], value)) return;

			  // 6. Actualizar estado
			  this.states[currentIndex] = value;

			// 7. Programar re-renderizado
			if( this._render ) this._render();
		};

		return [this.states[currentIndex], setState];
	}
}
