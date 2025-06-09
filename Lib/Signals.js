// Implementación optimizada de TC39 Signals (Draft 2025-5-9)
class Signal {
	constructor() {
		if (new.target === Signal) {
			throw new TypeError("Signal es una clase abstracta");
		}
	}

	get() {
		throw new Error("Método get() debe ser implementado");
	}
}

/**
 * @class State - Señal reactiva de lectura/escritura
 * @implements {Signal}
 */
class State extends Signal {
	/**
	 * @param {*} initialValue - Valor inicial de la señal
	 * @param {SignalOptions} [options] - Opciones de configuración
	 */
	constructor(initialValue, options = {}) {
		super();
		// Valor actual de la señal
		this._value = initialValue;

		// Opciones de configuración
		this.options = options;

		// Función para comparar valores (por defecto Object.is)
		this._equals = options.equals || Object.is;

		// Callbacks de ciclo de vida
		this._watchedCallback = options[Signal.subtle.watched];
		this._unwatchedCallback = options[Signal.subtle.unwatched];

		// Conjunto de suscriptores reactivos
		this._subscribers = new Set();

		// Estado de seguimiento
		this._watchCount = 0;
	}

	/**
	 * Obtiene el valor actual de la señal
	 * @returns {*} Valor actual
	 */
	get() {
		trackDependency(this);
		return this._value;
	}

	/**
	 * Establece un nuevo valor para la señal
	 * @param {*} value - Nuevo valor a establecer
	 */
	set(value) {
		if (!this._equals(this._value, value)) {
			//const oldValue = this._value;
			this._value = value;

			// Notificar a todos los suscriptores
			for (const subscriber of this._subscribers) {
				subscriber.update(this);
			}

			// Manejar callbacks de ciclo de vida
			if (this._watchCount > 0 && !this._isWatched) {
				this._isWatched = true;
				this._watchedCallback?.call(this);
			} else if (this._watchCount === 0 && this._isWatched) {
				this._isWatched = false;
				this._unwatchedCallback?.call(this);
			}
		}
	}

	/**
	 * Añade un suscriptor a esta señal
	 * @param {Watcher|Computed} subscriber - Suscriptor a añadir
	 */
	_addSubscriber(subscriber) {
		this._subscribers.add(subscriber);
		this._watchCount++;
	}

	/**
	 * Elimina un suscriptor de esta señal
	 * @param {Watcher|Computed} subscriber - Suscriptor a eliminar
	 */
	_removeSubscriber(subscriber) {
		this._subscribers.delete(subscriber);
		this._watchCount--;
	}
}

/**
 * @class Computed - Señal derivada computada reactivamente
 * @implements {Signal}
 */
class Computed extends Signal {
	/**
	 * @param {Function} compute - Función que calcula el valor derivado
	 * @param {SignalOptions} [options] - Opciones de configuración
	 */
	constructor(compute, options = {}) {
		super();
		// Función que calcula el valor derivado
		this._compute = compute;

		// Opciones de configuración
		this.options = options;

		// Función para comparar valores
		this._equals = options.equals || Object.is;

		// Callbacks de ciclo de vida
		this._watchedCallback = options[Signal.subtle.watched];
		this._unwatchedCallback = options[Signal.subtle.unwatched];

		// Dependencias de esta señal
		this._dependencies = new Set();

		// Suscriptores de esta señal
		this._subscribers = new Set();

		// Estado interno
		this._value = undefined;
		this._stale = true;
		this._watchCount = 0;

		// Evaluar inicialmente
		this._value = this._evaluate();
	}

	/**
	 * Obtiene el valor actual de la señal computada
	 * @returns {*} Valor actual
	 */
	get() {
		trackDependency(this);
		return this._value;
	}

	/**
	 * Evalúa la función de cálculo y actualiza el valor
	 * @returns {*} Nuevo valor calculado
	 */
	_evaluate() {
		// Limpiar dependencias antiguas
		for (const dep of this._dependencies) {
			dep._removeSubscriber(this);
		}
		this._dependencies.clear();

		// Evaluar con seguimiento de dependencias
		currentComputedStack.push(this);
		try {
			return this._compute.call(this);
		} finally {
			currentComputedStack.pop();
		}
	}

	/**
	 * Actualiza el valor de la señal si ha cambiado
	 * @param {Signal} source - Señal que ha cambiado
	 */
	update(source) {
		if (!this._stale && this._dependencies.has(source)) {
			const newValue = this._evaluate();

			if (!this._equals(this._value, newValue)) {
				this._value = newValue;
				this._stale = false;

				// Notificar a suscriptores
				for (const subscriber of this._subscribers) {
					subscriber.update(this);
				}
			}
		}

		this._stale = true;
	}

	/**
	 * Añade un suscriptor a esta señal
	 * @param {Watcher|Computed} subscriber - Suscriptor a añadir
	 */
	_addSubscriber(subscriber) {
		this._subscribers.add(subscriber);
		this._watchCount++;

		// Asegurar evaluación inicial
		if (this._stale) {
			this._value = this._evaluate();
			this._stale = false;
		}
	}

	/**
	 * Elimina un suscriptor de esta señal
	 * @param {Watcher|Computed} subscriber - Suscriptor a eliminar
	 */
	_removeSubscriber(subscriber) {
		this._subscribers.delete(subscriber);
		this._watchCount--;
	}
}

/**
 * @function effect - Crea un efecto secundario reactivo
 * @param {Function} callback - Función de efecto a ejecutar
 * @param {Object} [options] - Opciones de configuración
 * @returns {Function} Función para detener el efecto
 */
function effect(callback, options = {}) {
	const watcher = new Watcher(callback, options);
	watcher.run();

	return () => {
		watcher.stop();
	};
}

/**
 * @class Watcher - Observador de cambios en señales
 */
class Watcher {
	/**
	 * @param {Function} callback - Función a ejecutar cuando cambian las dependencias
	 * @param {Object} [options] - Opciones de configuración
	 */
	constructor(callback, options = {}) {
		// Función a ejecutar
		this.callback = callback;

		// Opciones de configuración
		this.options = options;

		// Conjunto de fuentes observadas
		this.sources = new Set();

		// Estado activo
		this.active = true;

		// Estado pendiente de actualización
		this.pending = false;
	}

	/**
	 * Ejecuta el efecto y rastrea dependencias
	 */
	run() {
		if (!this.active) return;

		// Limpiar fuentes antiguas
		for (const source of this.sources) {
			source._removeSubscriber(this);
		}
		this.sources.clear();

		// Ejecutar con seguimiento de dependencias
		currentWatcher = this;
		try {
			this.callback();
		} finally {
			currentWatcher = null;
		}
	}

	/**
	 * Programa una actualización para este observador
	 * @param {Signal} source - Señal que ha cambiado
	 */
	update(source) {
		// Ignorar si el watcher no está activo o si la fuente no es una dependencia actual
		if (!this.active || !this.sources.has(source)) {
			return;
		}

		if (!this.pending) {
			this.pending = true;
			queueMicrotask(() => {
				if (this.active) {
					this.pending = false;
					this.run();
				}
			});
		}
	}

	/**
	 * Detiene el observador y limpia recursos
	 */
	stop() {
		this.active = false;
		for (const source of this.sources) {
			source._removeSubscriber(this);
		}
		this.sources.clear();
	}
}

// Sistema de seguimiento de dependencias
const currentComputedStack = [];
let currentWatcher = null;

/**
 * Rastrea las dependencias cuando se accede a una señal
 * @param {Signal} signal - Señal a rastrear
 */
function trackDependency(signal) {
	if (currentWatcher) {
		signal._addSubscriber(currentWatcher);
		currentWatcher.sources.add(signal);
	}

	if (currentComputedStack.length > 0) {
		const currentComputed =
			currentComputedStack[currentComputedStack.length - 1];
		signal._addSubscriber(currentComputed);
		currentComputed._dependencies.add(signal);
	}
}

// Namespace para características avanzadas
Signal.subtle = {
	/**
	 * Symbol para callback cuando una señal empieza a ser observada
	 * @type {Symbol}
	 */
	watched: Symbol("watched"),

	/**
	 * Symbol para callback cuando una señal deja de ser observada
	 * @type {Symbol}
	 */
	unwatched: Symbol("unwatched"),

	/**
	 * Ejecuta un callback sin rastrear dependencias
	 * @param {Function} callback - Función a ejecutar
	 * @returns {*} Resultado del callback
	 */
	untrack(callback) {
		const prevWatcher = currentWatcher;
		const prevComputedStack = [...currentComputedStack];
		currentWatcher = null;
		currentComputedStack.length = 0;

		try {
			return callback();
		} finally {
			currentWatcher = prevWatcher;
			currentComputedStack.length = 0;
			currentComputedStack.push(...prevComputedStack);
		}
	},

	/**
	 * Obtiene la señal computada actual que está rastreando dependencias
	 * @returns {Computed|null} Señal computada actual o null
	 */
	currentComputed() {
		return currentComputedStack.length > 0
			? currentComputedStack[currentComputedStack.length - 1]
			: null;
	},

	/**
	 * Obtiene las dependencias de una señal
	 * @param {Signal} signal - Señal a inspeccionar
	 * @returns {Set<Signal>} Conjunto de señales dependientes
	 */
	introspectSources(signal) {
		return new Set(signal._dependencies || []);
	},

	/**
	 * Obtiene los suscriptores de una señal
	 * @param {Signal} signal - Señal a inspeccionar
	 * @returns {Set<Watcher|Computed>} Conjunto de suscriptores
	 */
	introspectSinks(signal) {
		return new Set(signal._subscribers || []);
	},

	/**
	 * Verifica si una señal tiene suscriptores
	 * @param {Signal} signal - Señal a verificar
	 * @returns {boolean} true si tiene suscriptores
	 */
	hasSinks(signal) {
		return signal._subscribers?.size > 0 || false;
	},

	/**
	 * Verifica si una señal tiene dependencias
	 * @param {Signal} signal - Señal a verificar
	 * @returns {boolean} true si tiene dependencias
	 */
	hasSources(signal) {
		return signal._dependencies?.size > 0 || false;
	},
};

// Exportar clases
Signal.State = State;
Signal.Computed = Computed;

// Exportar funciones
Signal.effect = effect;

export default Signal;
