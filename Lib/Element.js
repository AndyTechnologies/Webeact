import { Context } from "./Context.js";

/**
 * Clase base de la que van a heredar todos los web-components
 */
export class Element extends HTMLElement {
	// El tiempo en el que un script externo (importado con src) es nuevamente cargado
	static SCRIPT_TTL = 2 * 60 * 1000; // minutos

	/**
	 * Crea una instancia de Element con el contenido del componente
	 * @param {string} source contenido del componente
	 */
	constructor(source) {
		super();
		this.templateSrc = source; // Contenido del componente
		this.shadow = this.attachShadow({ mode: "open" }); // Crear un ShadowDOM

		// Estados internos
		this.pendingRender = null; // Renderizado diferido (para no hacer multiples re-renderizados)
		this.scriptCache = new Map(); // Blobs de scripts (cache de scripts externos)
		this.intersectionObserver = null; // Observer del ViewPort (para lazy loading)

		// Necesarios para el Context
		this.Context = new Context(
			this.tagName,
			this._deferRender.bind(this),
			this.hasAttribute.bind(this),
			this.getAttribute.bind(this)
		);

		// Extensión del contexto por componentes hijos
		this.extendContext();

		// Iniciar carga diferida
		this.initLazyLoading();
	}

	/**
	 * Renderizado diferido (non-blocking)
	 */
	_deferRender() {
		this.pendingRender = true;
		queueMicrotask(() => {
			this.updateDynamicContent();
			this.pendingRender = false;
		});
	}

	/* Métodos que deben implementar los hijos */

	// Se llama luego de cada renderizado
	rendered() { }
	// Se llama cuando el componente se conecta al DOM
	onConnected() { }
	// Extender el contexto (para extender funciones y variables)
	extendContext() { }
	// API de WC: Atributos por los que se va a disparar el attributeChangedCallback
	static get observedAttributes() {
		return [];
	}

	/**
	 * Callback que se ejecuta si los observedAttributes cambian
	 * @param {string} _nameAttr nombre del atributo
	 * @param {*} oldValue viejo valor del atributo
	 * @param {*} newValue nuevo valor del atributo
	 */
	attributeChangedCallback(_nameAttr, oldValue, newValue) {
		if (oldValue !== newValue) {
			// Programar re-renderizado
			this._deferRender();
		}
	}

	/**
	 * Re-Ejecutar los Scripts Tag marcados con data-dynamic
	 * (Reinicia los addEventListeners)
	 */
	reexecuteDynamicScripts() {
		// 1 - Reiniciar contador de hooks antes de cada re-ejecución
		this.Context.hookIndex = 0;

		// 2 - Reiniciar addEventListeners de todos los elementos hijos del ShadowDOM
		this.shadow.querySelectorAll("*").forEach((elmnt) => {
			const e = elmnt.cloneNode(true);
			elmnt.parentNode.replaceChild(e, elmnt);
		});

		// 3 - Limpiar scrips para evitar duplicados
		const scripts = [...this.shadow.querySelectorAll("script[data-dynamic]")];
		scripts.forEach((script) => script.remove()); // `remove` del DOM

		// 4 - por cada script, hacer una copia y re-insertarlo al shadowDOM (para que se vuelva a ejecutar)
		scripts.forEach(this.reexecuteSingleScript.bind(this));
	}

	/**
	 * Lógica para re-ejecutar el código de un script
	 * @param {string} script código del script tag
	 */
	async reexecuteSingleScript(script) {
		const newScript = document.createElement("script");

		// 4.1 - Copiar atributos
		script.getAttributeNames().forEach((name) => {
			newScript.setAttribute(name, script.getAttribute(name));
		});

		// 4.2 - Verificar si es un script en linea o externo
		if (script.textContent.trim()) {
			// Ya no es necesario inyectar contexto y document
			newScript.textContent = script.textContent;
			// Re-Ejecutar script
			this.executeScript(newScript, this.shadow);
		} else if (script.hasAttribute("src")) {
			// 4.3 - Si es un script externo
			await this.processExternalScript(script, newScript, true, this.shadow);
		}
	}

	/**
	 * Se llama cuando el componente esta a 200px del bottom (LazyLoading)
	 * es el 1er renderizado del componente
	 */
	loadResources() {
		this.render(); // rendering content
	}

	/**
	 * Función de renderizado inicial (se llama una única vez)
	 */
	async render() {
		try {
			// Cargar template
			const html = this.templateSrc;
			// Crear template y clonar contenido
			this.template = document.createElement("template");
			this.template.innerHTML = html;
			this.fragment = this.template.content.cloneNode(true);

			// Procesar elementos slots
			this.processSlots(this.fragment);
			// Inyectar en shadow DOM
			this.shadow.appendChild(this.fragment);
			// Ejecutar scripts
			await this.processScripts(this.shadow);
			// Ejecutar callbacks dinámicos por primera vez
			this.executeDynamicsCallbacks();

			// Callback extensible
			this.onConnected();
		} catch (error) {
			console.error("Error al cargar el template:", error);
		}
	}

	/**
	 * Envolver código para inyectar contexto
	 * @param {string} code código a inyectar
	 * @returns {string} código con el contexto document inyectado
	 */
	wrapScriptCode(code) {
		return `
	    (function(document) {
	      {${code};};
	    }).call(window.component, window.component.shadow);
	  `;
	}

	/**
	 * Ejecutar script en contexto seguro
	 * @param {HTMLScriptElement} scriptElement elemento script para agregar al DOM
	 */
	executeScript(scriptElement) {
		// Agregar funciones globales al window
		Object.entries(this.Context.callbacks).forEach(([name, func]) => {
			if (typeof func === "function"){
				window[name] = func;
			}else if (typeof func === "object"){
				window[name] = {};
				Object.assign(window[name], func);
			}
		});
		// Agregar contexto al window
		window.ctx = this.Context;
		// Añadir referencia al this en el window
		window.component = this;
		this.shadow.appendChild(scriptElement); // Inyectar al shadowDOM
	}

	/**
	 * Procesar scripts (static y dynamic)
	 * @param {DocumentFragment} fragment fragmento del documento a analizar
	 */
	async processScripts(fragment) {
		// obtener todos los script tag
		const scripts = [...fragment.querySelectorAll("script")];
		// Llama al metodo remove de todos los elementos del array
		remove_all_from(scripts);

		for (const script of scripts) {
			const isInline = script.textContent.trim();
			const isExternal = script.hasAttribute("src");

			if (isInline || isExternal) {
				// Crear nueva etiqueta script
				const newScript = document.createElement("script");
				// Copiar atributos
				copyAttrs(script, newScript);
				// verificar si es dinámico o no
				const isDynamic = script.hasAttribute("data-dynamic");
				// LLamar a las funciones que se encargan de procesar los scripts
				(isInline // if have content
					? this.processInlineScript.bind(this) // is inline script
					: this.processExternalScript.bind(this))(
					// is external script
					script,
					newScript,
					isDynamic,
					this.shadow
				);
			}
		}
	}

	/**
	 * Procesar los scripts inline
	 * @param {HTMLScriptElement} script elemento Script del DOM
	 * @param {HTMLScriptElement} newScript elemento Script nuevo
	 */
	processInlineScript(script, newScript,) {
		// Inyectar contexto y document
		const processedCode = this.wrapScriptCode(script.textContent);
		newScript.textContent = processedCode;

		// Ejecutar script
		this.executeScript(newScript);
	}

	/**
	 * Procesar scripts externos con caché y TTL
	 * @param {HTMLScriptElement} originalScript elemento Script del DOM
	 * @param {HTMLScriptElement} newScript elemento Script nuevo
	 */
	async processExternalScript(originalScript, newScript) {
		// 1. Obtener el src del script
		const src = originalScript.getAttribute("src");

		// 2. Verificar caché y TTL
		if (this.scriptCache.has(src)) {
			// 2:1. Obtener la cache del src
			const cached = this.scriptCache.get(src);
			// 2:2. Verificar si la cache del src es válida
			const isFresh = Date.now() - cached.timestamp < Element.SCRIPT_TTL;

			// 2:3. Carga desde cache
			if (isFresh) {
				newScript.src = cached.url;
				this.executeScript(newScript);
				return;
			}
			// 2:4. Eliminar cache expirado y continuar normalmente
			URL.revokeObjectURL(cached.url);
			this.scriptCache.delete(src);
		}
		// 3. Es un nuevo elemento o cache expirado
		this._loadExternalScript(src, newScript);
	}

	/**
	 * Hacer fetch para cargar el código del script externo
	 * @param {string} src Valor del atributo src del script original
	 * @param {HTMLScriptElement} newScript Elemento script nuevo
	 */
	async _loadExternalScript(src, newScript) {
		try {
			// 4. Obtener el código del script
			const response = await fetch(src);
			const text = await response.text();

			// 5. Crear blob con código procesado (para cache y poder usar useStates)
			const blobCode = this.wrapScriptCode(text);
			const blob = new Blob([blobCode], { type: "application/javascript" });
			const url = URL.createObjectURL(blob);

			// 6. Guardar en caché con timestamp
			this.scriptCache.set(src, {
				url,
				timestamp: Date.now(),
			});

			// 7. Configurar y ejecutar el script
			newScript.src = url; // Como el src es un ObjectURL con Blob, se ejecutará el código directamente
			this.executeScript(newScript);
		} catch (error) {
			console.error(`Error al procesar script externo: ${src}`, error);
		}
	}

	/**
	 * Agregar etiquetas de accesibilidad a los slots
	 * @param {DocumentFragment} fragment Fragmento del documento dónde se buscan los slot tags
	 */
	processSlots(fragment) {
		const allSlots = fragment.querySelectorAll("slot");
		allSlots.forEach((slot) => {
			// Inicializar ARIA attributes
			slot.setAttribute("aria-live", "polite");
			slot.setAttribute("aria-relevant", "additions removals");
		});
	}

	/**
	 * Actualización dinámica basada en callbacks registrados
	 */
	updateDynamicContent() {
		this.performUpdate();
		this.rendered();
	}

	/**
	 * Llama a los dynamic callbacks para un atributo y actualiza los metadatas de los element
	 * @param {string} key atributo a revisar sus callbacks
	 * @param {Array} item array de elementos con el handler y el metadata
	 * @returns lista con los elementos actualizados
	 */
	performDynamicsCallbacks(key, item) {
		let element = Array.from(item);
		// Si no existe el atributo, no se hace nada
		if (!this.hasAttribute(key)) return element;

		const processElement = (element) => {
			const { handler, metadata } = element;
			// Si el valor ha cambiado
			if (this.getAttribute(key) !== metadata.oldData) {
				try {
					// Llamar al handler
					handler(this.getAttribute(key), metadata);
					// Actualizar el metadata con el nuevo valor del atributo
					return this.getAttribute(key);
				} catch (error) {
					console.error(`Error en handler para ${key}:`, error);
				}
			}
		}

		// Para cuando solo es un elemento
		if (element.length === 1 ){
			element[0].metadata.oldData = processElement(element[0]);
		}else{
			// Si son varios, hacemos un map para generar
			// los nuevos metadata de cada dynamicCallback
			// accediendo a cada elemento individualmente
			element = element.map(e => {
				return {
					...e,
					metadata: {
						...e.metadata,
						oldData: processElement(e)
					}
				}
			})
		}
		return element;
	}

	/**
	 * Re-Ejecutar todos los dynamics callbacks registrados (siempre que hayan cambiados los atributos asociados)
	 */
	executeDynamicsCallbacks(){
		this.Context.dynamicCallbacks.forEach((value, key) => {
			if (Array.from(value).length > 0)
				this.Context.dynamicCallbacks[key] = this.performDynamicsCallbacks(key, value);
		});
	}

	/**
	 * Llama a los dynamicCallbacks con el nuevo valor del atributo
	 * y re-ejecuta los scripts marcados con data-dynamic
	 */
	performUpdate() {
		// Ejecutar callbacks para los atributos con cambios
		this.executeDynamicsCallbacks();

		// Re-ejecutar scripts dinámicos
		this.reexecuteDynamicScripts();
	}

	/* Metodos Auxiliares */

	/**
	 * Lazy loading con IntersectionObserver
	 * Hace que el componente se renderice por primera vez solo si está visible
	 */
	initLazyLoading() {
		if (!("IntersectionObserver" in window)) {
			this.loadResources(); // IntersectionObserver no soportado, cargar inmediatamente
			return;
		}

		// Crear observer
		this.intersectionObserver = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					this.loadResources();
					this.intersectionObserver.disconnect(); // Desconectar observer para evitar re-ejecuciones
				}
			},
			{ rootMargin: "0px 0px 200px 0px" }
		); // Cargar con anticipación (margin: top right bottom left)

		this.intersectionObserver.observe(this); // Observar el componente
	}
}

// UTILS FUNCTIONS

/**
 * Remover del DOM una lista de HTMLElement's
 * @param {Array} listOfElements lista de HTMLElement's a ser removidos del DOM
 */
function remove_all_from(listOfElements)
{ Array.from(listOfElements).forEach((e) => e.remove()); }

/**
 * Copiar los atributos de un elemento a otro
 * @param {HTMLElement} source elemento desde el que se copian
 * @param {HTMLElement} dest elemento hacia el que se copian
 */
function copyAttrs(source, dest) {
	source.getAttributeNames().forEach((name) => {
		dest.setAttribute(name, source.getAttribute(name));
	});
}
