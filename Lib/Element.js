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

		this._Context = new Context(
			this.tagName,
			this._deferRender.bind(this),
			this.hasAttribute.bind(this),
			this.getAttribute.bind(this)
		);
		// Iniciar carga diferida
		this.render();
	}

	/**
	 * @returns {Context}
	 */
	get Context(){
		if( !this._Context ){
			throw new Error("Error: el contexto no ha sido creado!");
		}
		return this._Context;
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
		// Reiniciar contador de hooks antes de cada re-ejecución
		this.Context.hookIndex = 0;

		// Limpiar scrips para evitar duplicados
		const scripts = [...this.shadow.querySelectorAll("script[data-dynamic]")];
		scripts.forEach((script) => script.remove()); // `remove` del DOM

		// por cada script, hacer una copia y re-insertarlo al shadowDOM (para que se vuelva a ejecutar)
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
	    {
			${code};
		};
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
		// Añadir referencia al document
		window.doc = this.shadow;
		this.Context.wrap(() => {
			this.shadow.appendChild(scriptElement); // Inyectar al shadowDOM
		});
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
	 * Llama a los dynamicCallbacks con el nuevo valor del atributo
	 * y re-ejecuta los scripts marcados con data-dynamic
	 */
	performUpdate() {
		// Re-ejecutar scripts dinámicos
		this.reexecuteDynamicScripts();
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
