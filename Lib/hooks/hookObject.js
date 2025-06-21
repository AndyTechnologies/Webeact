/**
 * @typedef HookType
 * @property {Symbol} EffectHook
 * @property {Symbol} StateHook
 */
export const HookType = Object.freeze({
	EffectHook: Symbol("effect"),
	StateHook: Symbol("state"),
	TransitionHook: Symbol("view-transition"),
	LocalStorageHook: Symbol("local-storage"),
	ReferenceHook: Symbol("reference"),
	EventListenerHook: Symbol("event-listener"),
	MediaQueryHook: Symbol("media-query"),
	CallbackHook: Symbol("callback"),
	MemoHook: Symbol("memo"),
	ReducerHook: Symbol("reducer"),
	IDHook: Symbol("id"),
});

/**
 * Mutex simple para sincronización en entornos multi-threaded
 */
class SimpleMutex {
	constructor() {
		this._locked = false;
		this._queue = [];
	}

	/**
	 * Adquiere el lock de forma asíncrona
	 * @returns {Promise<Function>} Función para liberar el lock
	 */
	async acquire() {
		return new Promise((resolve) => {
			if (!this._locked) {
				this._locked = true;
				resolve(() => this.release());
			} else {
				this._queue.push(() => resolve(() => this.release()));
			}
		});
	}

	/**
	 * Adquiere el lock de forma síncrona (para operaciones rápidas)
	 * @returns {Function|null} Función para liberar el lock o null si no se puede adquirir
	 */
	tryAcquire() {
		if (!this._locked) {
			this._locked = true;
			return () => this.release();
		}
		return null;
	}

	/**
	 * Libera el lock
	 */
	release() {
		if (this._queue.length > 0) {
			const next = this._queue.shift();
			next();
		} else {
			this._locked = false;
		}
	}
}

/**
 * Clase que gestiona todos los hooks con optimizaciones de performance y thread-safety
 */
export class Hook {
	/**
	 * Registro Global de los Hooks usando Map para mejor performance
	 * @type {Map<number, Object>}
	 */
	static _hooks = new Map();

	/**
	 * Contador global para asignar índices únicos
	 */
	static _hookCounter = 0;

	/**
	 * Mutex para operaciones thread-safe
	 */
	static _mutex = new SimpleMutex();

	/**
	 * Cache para búsquedas frecuentes por tipo
	 * @type {Map<Symbol, Set<number>>}
	 */
	static _typeIndex = new Map();

	/**
	 * Sistema de Frames para gestión de contextos de hooks
	 * @type {Map<string, Object>}
	 */
	static _frames = new Map();

	/**
	 * Frame activo actual
	 * @type {string|null}
	 */
	static _currentFrame = null;

	/**
	 * Contador de hooks dentro del frame actual
	 * @type {number}
	 */
	static _currentFrameHookIndex = 0;


	/**
	 * Crea un hook en el espacio global
	 * @param {*} info Valor inicial del hook
	 * @param {Symbol} hookType el tipo de hook (por defecto StateHook)
	 */
	constructor(info, hookType = HookType.StateHook) {

		// Si estamos en un frame, intentar reutilizar hook existente
		if (Hook._currentFrame) {
			const existingHook = Hook._getFrameHook(Hook._currentFrame, Hook._currentFrameHookIndex, hookType);
			if (existingHook) {
				// Reutilizar hook existente
				this.type = existingHook.type;
				this.idx = existingHook.idx;
				Hook._currentFrameHookIndex++;
				return;
			}
		}

		// Operación thread-safe para crear el hook
		const release = Hook._mutex.tryAcquire();
		if (!release) {
			throw new Error('Could not acquire lock for hook creation. Try again.');
		}

		try {
			this.type = hookType;
			this.idx = Hook._hookCounter++;

			// Crear entrada en el Map principal
			const hookData = {
				type: this.type,
				index: this.idx,
				data: info,
				created: Date.now(),
				frameId: Hook._currentFrame || null,
				frameIndex: Hook._currentFrame ? Hook._currentFrameHookIndex : null
			};

			Hook._hooks.set(this.idx, hookData);

			// Actualizar índice por tipo para búsquedas rápidas
			if (!Hook._typeIndex.has(this.type)) {
				Hook._typeIndex.set(this.type, new Set());
			}
			Hook._typeIndex.get(this.type).add(this.idx);

			// Si estamos en un frame, registrar el hook
			if (Hook._currentFrame) {
				Hook._registerFrameHook(Hook._currentFrame, Hook._currentFrameHookIndex, this);
				Hook._currentFrameHookIndex++;
			}
		} finally {
			release();
		}
	}

	/**
	 * Obtiene la información de un hook
	 * @returns {*} retorna la data del hook o undefined si no existe
	 */
	get() {
		// Lectura rápida sin lock (lecturas son thread-safe en Maps)
		const hookInfo = Hook._hooks.get(this.idx);

		if (hookInfo && hookInfo.type === this.type) {
			return hookInfo.data;
		}

		return undefined;
	}

	/**
	 * Cambia la información del data completamente
	 * @param {*} info Nuevo valor para el hook
	 */
	set(info) {
		const release = Hook._mutex.tryAcquire();
		if (!release) {
			throw new Error('Could not acquire lock for hook update. Try again.');
		}

		try {
			const hookInfo = Hook._hooks.get(this.idx);

			if (hookInfo && hookInfo.type === this.type) {
				hookInfo.data = info;
				hookInfo.lastModified = Date.now();
			} else {
				throw new Error(`Hook at index ${this.idx} does not exist or is invalid`);
			}
		} finally {
			release();
		}
	}

	/**
	 * Versión asíncrona de set para operaciones pesadas
	 * @param {*} info Nuevo valor para el hook
	 * @returns {Promise<void>}
	 */
	async setAsync(info) {
		const release = await Hook._mutex.acquire();

		try {
			const hookInfo = Hook._hooks.get(this.idx);

			if (hookInfo && hookInfo.type === this.type) {
				hookInfo.data = info;
				hookInfo.lastModified = Date.now();
			} else {
				throw new Error(`Hook at index ${this.idx} does not exist or is invalid`);
			}
		} finally {
			release();
		}
	}

	/**
	 * Actualiza el data de un hook (solo para objetos en Data)
	 * @param {Object} updates Valores a actualizar del Data
	 */
	patch(updates) {
		const currentData = this.get();
		if (typeof currentData !== 'object' || currentData === null) {
			throw new Error('patch() can only be used with object data');
		}
		this.set({ ...currentData, ...updates });
	}

	/**
	 * Versión asíncrona de patch
	 * @param {Object} updates Valores a actualizar del Data
	 * @returns {Promise<void>}
	 */
	async patchAsync(updates) {
		const currentData = this.get();
		if (typeof currentData !== 'object' || currentData === null) {
			throw new Error('patch() can only be used with object data');
		}
		await this.setAsync({ ...currentData, ...updates });
	}

	/**
	 * Verifica si el hook existe y es válido
	 * @returns {boolean}
	 */
	isValid() {
		const hookInfo = Hook._hooks.get(this.idx);
		return hookInfo && hookInfo.type === this.type && hookInfo.index === this.idx;
	}

	/**
	 * Elimina el hook del registro global
	 */
	destroy() {
		const release = Hook._mutex.tryAcquire();
		if (!release) {
			throw new Error('Could not acquire lock for hook destruction. Try again.');
		}

		try {
			if (this.isValid()) {
				// Remover del Map principal
				Hook._hooks.delete(this.idx);

				// Remover del índice por tipo
				const typeSet = Hook._typeIndex.get(this.type);
				if (typeSet) {
					typeSet.delete(this.idx);
					// Si el set queda vacío, lo removemos
					if (typeSet.size === 0) {
						Hook._typeIndex.delete(this.type);
					}
				}
			}
		} finally {
			release();
		}
	}

	/**
	 * Obtiene metadatos del hook
	 * @returns {Object|null}
	 */
	getMetadata() {
		const hookInfo = Hook._hooks.get(this.idx);
		if (hookInfo && hookInfo.type === this.type) {
			return {
				index: hookInfo.index,
				type: hookInfo.type,
				created: hookInfo.created,
				lastModified: hookInfo.lastModified || hookInfo.created
			};
		}
		return null;
	}

	/**
	 * Métodos estáticos para gestión global
	 */

	/**
	 * Limpia todos los hooks de forma thread-safe
	 * @returns {Promise<void>}
	 */
	static async clearAll() {
		const release = await Hook._mutex.acquire();

		try {
			Hook._hooks.clear();
			Hook._typeIndex.clear();
			Hook._frames.clear();
			Hook._hookCounter = 0;
			Hook._currentFrame = null;
			Hook._currentFrameHookIndex = 0;
		} finally {
			release();
		}
	}

	/**
	 * Obtiene información de todos los hooks activos
	 * @returns {Array<Object>}
	 */
	static getAllHooks() {
		// Convertir Map values a Array de forma eficiente
		return Array.from(Hook._hooks.values());
	}

	/**
	 * Obtiene hooks por tipo de forma optimizada
	 * @param {Symbol} hookType
	 * @returns {Array<Object>}
	 */
	static getHooksByType(hookType) {
		const typeIndices = Hook._typeIndex.get(hookType);
		if (!typeIndices) {
			return [];
		}

		// Usar el índice para acceso O(1) a cada hook
		return Array.from(typeIndices)
			.map(idx => Hook._hooks.get(idx))
			.filter(hook => hook !== undefined);
	}

	/**
	 * Obtiene estadísticas de performance
	 * @returns {Object}
	 */
	static getStats() {
		return {
			totalHooks: Hook._hooks.size,
			hooksByType: Array.from(Hook._typeIndex.entries()).map(([type, indices]) => ({
				type: type.toString(),
				count: indices.size
			})),
			nextIndex: Hook._hookCounter,
			memoryUsage: Hook._hooks.size * 64 + Hook._typeIndex.size * 32, // estimación en bytes
			frames: {
				total: Hook._frames.size,
				active: Array.from(Hook._frames.values()).filter(f => f.isActive).length,
				currentFrame: Hook._currentFrame,
				currentFrameHookIndex: Hook._currentFrameHookIndex
			}
		};
	}

	/**
	 * SISTEMA DE FRAMES - Métodos estáticos para gestión de contextos
	 */

	/**
	 * Inicia un nuevo frame de hooks
	 * @param {string} frameId Identificador único del frame
	 * @param {Object} options Opciones del frame
	 * @returns {void}
	 */
	static startFrame(frameId, options = {}) {
		if (Hook._currentFrame) {
			throw new Error(`Frame '${Hook._currentFrame}' is already active. End it before starting a new one.`);
		}

		Hook._currentFrame = frameId;
		Hook._currentFrameHookIndex = 0;

		// Crear o reutilizar frame existente
		if (!Hook._frames.has(frameId)) {
			Hook._frames.set(frameId, {
				id: frameId,
				created: Date.now(),
				lastUsed: Date.now(),
				hooks: new Map(), // Map<frameIndex, hookInstance>
				options: { ...options },
				renderCount: 0,
				isActive: true
			});
		} else {
			// Actualizar frame existente
			const frame = Hook._frames.get(frameId);
			frame.lastUsed = Date.now();
			frame.renderCount++;
			frame.isActive = true;
		}
	}

	/**
	 * Finaliza el frame actual
	 * @returns {Object|null} Estadísticas del frame terminado
	 */
	static endFrame() {
		if (!Hook._currentFrame) {
			return null;
		}

		const frameId = Hook._currentFrame;
		const frame = Hook._frames.get(frameId);

		if (frame) {
			frame.isActive = false;
			frame.hookCount = Hook._currentFrameHookIndex;
		}

		const stats = {
			frameId,
			hooksUsed: Hook._currentFrameHookIndex,
			renderCount: frame?.renderCount || 0
		};

		Hook._currentFrame = null;
		Hook._currentFrameHookIndex = 0;

		return stats;
	}

	/**
	 * Ejecuta una función dentro de un frame
	 * @param {string} frameId Identificador del frame
	 * @param {Function} callback Función a ejecutar
	 * @param {Object} options Opciones del frame
	 * @returns {*} Resultado de la función
	 */
	static withFrame(frameId, callback, options = {}) {
		Hook.startFrame(frameId, options);

		try {
			return callback();
		} finally {
			Hook.endFrame();
		}
	}

	/**
	 * Obtiene un hook existente del frame o null si no existe
	 * @param {string} frameId ID del frame
	 * @param {number} frameIndex Índice del hook en el frame
	 * @param {Symbol} expectedType Tipo esperado del hook
	 * @returns {Hook|null}
	 */
	static _getFrameHook(frameId, frameIndex, expectedType) {
		const frame = Hook._frames.get(frameId);
		if (!frame) return null;

		const hookInstance = frame.hooks.get(frameIndex);
		if (!hookInstance) return null;

		// Verificar que el tipo coincida para evitar errores
		if (hookInstance.type !== expectedType) {
			throw new Error(
				`Hook type mismatch at frame '${frameId}' index ${frameIndex}. ` +
				`Expected ${expectedType.toString()}, got ${hookInstance.type.toString()}`
			);
		}

		return hookInstance;
	}

	/**
	 * Registra un hook en el frame actual
	 * @param {string} frameId ID del frame
	 * @param {number} frameIndex Índice en el frame
	 * @param {Hook} hookInstance Instancia del hook
	 */
	static _registerFrameHook(frameId, frameIndex, hookInstance) {
		const frame = Hook._frames.get(frameId);
		if (frame) {
			frame.hooks.set(frameIndex, hookInstance);
		}
	}

	/**
	 * Obtiene información de un frame específico
	 * @param {string} frameId ID del frame
	 * @returns {Object|null}
	 */
	static getFrameInfo(frameId) {
		const frame = Hook._frames.get(frameId);
		if (!frame) return null;

		return {
			id: frame.id,
			created: frame.created,
			lastUsed: frame.lastUsed,
			renderCount: frame.renderCount,
			hookCount: frame.hooks.size,
			isActive: frame.isActive,
			options: frame.options
		};
	}

	/**
	 * Lista todos los frames activos
	 * @returns {Array<Object>}
	 */
	static getActiveFrames() {
		return Array.from(Hook._frames.values())
			.filter(frame => frame.isActive)
			.map(frame => ({
				id: frame.id,
				renderCount: frame.renderCount,
				hookCount: frame.hooks.size,
				lastUsed: frame.lastUsed
			}));
	}

	/**
	 * Limpia un frame específico y todos sus hooks
	 * @param {string} frameId ID del frame a limpiar
	 * @returns {boolean} true si se limpió exitosamente
	 */
	static clearFrame(frameId) {
		const frame = Hook._frames.get(frameId);
		if (!frame) return false;

		// Destruir todos los hooks del frame
		for (const hookInstance of frame.hooks.values()) {
			try {
				hookInstance.destroy();
			} catch (error) {
				console.warn(`Error destroying hook in frame ${frameId}:`, error);
			}
		}

		// Remover el frame
		Hook._frames.delete(frameId);

		// Si era el frame actual, limpiarlo
		if (Hook._currentFrame === frameId) {
			Hook._currentFrame = null;
			Hook._currentFrameHookIndex = 0;
		}

		return true;
	}

	/**
	 * Obtiene el frame actual
	 * @returns {string|null}
	 */
	static getCurrentFrame() {
		return Hook._currentFrame;
	}

	/**
	 * Obtiene el índice actual del hook en el frame
	 * @returns {number}
	 */
	static getCurrentFrameHookIndex() {
		return Hook._currentFrameHookIndex;
	}

	/**
	 * Verifica si estamos dentro de un frame
	 * @returns {boolean}
	 */
	static isInFrame() {
		return Hook._currentFrame !== null;
	}

}
