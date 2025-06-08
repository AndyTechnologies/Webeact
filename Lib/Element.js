
export class Element extends HTMLElement {
	// El tiempo en el que un script externo (importado con src) es nuevamente cargado o recogido desde el cache
  static SCRIPT_TTL = 5 * 60 * 1000; // 5 minutos
	
  constructor(source) {
    super();
    this.templateSrc = source; // URL del template
    this.shadow = this.attachShadow({ mode: 'open' }); // Crear un ShadowDOM
    
    // Estados internos
    this.pendingRender = null; // Renderizado diferido (para no hacer multiples re-renderizados)
    this.scriptCache = new Map(); // Blobs de scripts (cache de scripts externos)
    this.intersectionObserver = null; // Observer del ViewPort (para lazy loading)
    
    // Necesarios para el Context
		this.dynamicCallbacks = new Map(); // Callbacks para ejecutarse cuando se actualice el estado de un atributo
		this.states = [];       // Almacena los estados por orden
		this.effects = []; 			// Effects (hook para ejecutar una función cuando cambia un estado)
    this.hookIndex = 0;     // Índice actual para useState
    
    // Configuración base del contexto
    this.Context = {
    	// Registrar una función que se ejecutará cuando se actualice el estado de un atributo o slot
      registerDynamicCallback: this.registerDynamicCallback.bind(this),
      // Des-Registrar una función que se ejecutará cuando se actualice el estado de un atributo o slot
      unregisterDynamicCallback: this.unregisterDynamicCallback.bind(this),
      // Obtener los atributos que están siendo observados (API de Web-Components)
      getAttributes: this.getAttributes.bind(this),
      
      /* Hooks */
      
      // Crear un estado reactivo que cuando cambie desencadenará un re-renderizado
      useState: this.useState.bind(this),
      // Una función que se ejecutará cuando cambien sus dependencias
      useEffect: this.useEffect.bind(this),
      // Activar o desactivar pantalla completa
      useFullScreen: this.useFullScreen.bind(this),
      // Intercambia los estados de pantalla completa
      useToggleFullScreen: this.useToggleFullScreen.bind(this),
      // Hace una transición de view (hace un re-render diferido)
      useViewTransition: this.useViewTransition.bind(this),
      // Crea un escucha para Server-Side-Events
      // (Custom-Events debe ser un objeto donde las key sean el nombre del evento y el valor su callback)
      useSSE: this.useSSE.bind(this),
    };
    
    // Extensión del contexto por componentes hijos
    this.extendContext();
    
    // Iniciar carga diferida
    this.initLazyLoading();
  }
  
  _deferRender(){
    this.pendingRender = true;
    queueMicrotask(() => {
      this.updateDynamicContent(); // o this.render() si usas renderizado manual
      this.pendingRender = false;
    });
  }
  
  
  
/* Métodos del Context */

// Registrar una funcion que se ejecutará cuando se actualice el estado
// de un atributo o slot
registerDynamicCallback(key, callback, metadata = null, context = this, ensureNoDuplicates = true) {
	
	if (ensureNoDuplicates){
		this.unregisterDynamicCallback(key, callback); // no duplicates
	}
	
	if (!context.dynamicCallbacks.has(key)) {
	  context.dynamicCallbacks.set(key, []);
	}
	
	context.dynamicCallbacks.get(key).push({
		callback, 
		metadata, 
		oldData: this.hasAttribute(key) ? this.getAttribute(key) : null 
	});
}

// Quitar una funcion que se había registrado para ejecutarse cuando se actualice el estado
// de un atributo o slot
unregisterDynamicCallback(key, callback, context = this) {
	if (context.dynamicCallbacks.has(key)) {
		const callbacks = context.dynamicCallbacks.get(key).filter(
	    item => item.callback === callback // quitar los callbacks iguales
	  );
	  context.dynamicCallbacks.set(key, callbacks);
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

// Activa o Desactiva la pantalla completa
useFullScreen(enable = true){
	if (enable && document.fullscreenEnabled && document.fullscreenElement ===  null){
		return this.requestFullscreen();
	}
	if(!enable && document.fullscreenEnabled && document.fullscreenElement !==  null){
		return document.exitFullscreen();
	}
	return null;
}

// Intercambia los estados de pantalla completa
useToggleFullScreen() {
	if (!document.fullscreenEnabled) return null;
	if( document.fullscreenElement !== null ) {
		return document.exitFullscreen();
	}else{
		return this.requestFullscreen()
	}
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
		const [_,oldParams] = Array.from(this.effects[currentIndex]);
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
		this._deferRender();
	};
	
	return [this.states[currentIndex], setState];
}

// Obtener los atributos que están siendo observados
getAttributes() {
  const attrs = {};
  this.constructor.observedAttributes.forEach(attr => {
    attrs[attr] = this.getAttribute(attr);
  });
  return attrs;
}

/* Métodos que deben implementar los hijos */
  
  // Se llama luego de cada renderizado
  rendered() {}
  // Extender el contexto (para extender funciones y variables)
  extendContext() {}
  // Se llama cuando el componente se conecta al DOM
  onConnected() {}
  // API de WC: Atributos por los que se va a disparar el attributeChangedCallback
  static get observedAttributes() { return []; }
  
  attributeChangedCallback(_nameAttr, oldValue, newValue) {
    if (oldValue !== newValue) {
      // Programar re-renderizado
			this._deferRender();
    }
  }

  reexecuteDynamicScripts(){
	  // 1 - Reiniciar contador de hooks antes de cada re-ejecución	
	  this.hookIndex = 0;
  	// 2 - Reiniciar addEventListeners de todos los elementos hijos del ShadowDOM
		this.shadow.querySelectorAll("*").forEach(elmnt => {
			const e = elmnt.cloneNode(true);
			elmnt.parentNode.replaceChild(e, elmnt);
		})
		// 3 - Limpiar scrips para evitar duplicados
 		const scripts = [...this.shadow.querySelectorAll('script[data-dynamic]')];
	  scripts.forEach(script => script.remove()); // `remove` del DOM
  
		// 4 - por cada script, hacer una copia y re-insertarlo al shadowDOM (para que se vuelva a ejecutar)
		scripts.forEach(async (script) => {
			const newScript = document.createElement('script');
   
			// 4.1 - Copiar atributos
			script.getAttributeNames().forEach(name => {
			  newScript.setAttribute(name, script.getAttribute(name));
			});
			
			// 4.2 - Verificar si es un script en linea o externo
			if (script.textContent.trim()) {
				// Ya no es necesario inyectar contexto y document
			  newScript.textContent = script.textContent;
			  // Re-Ejecutar script
			  this.executeScript(newScript, this.shadow);
			} else if (script.hasAttribute('src')) {
			   // 4.3 - Si es un script externo
				await this.processExternalScript(script, newScript, true, this.shadow);
			}
		})	
  }
  
  // Se llama cuando el componente esta a 200px del bottom (LazyLoading)
  loadResources(){
		this.render(); // rendering content
  }
  
  // Función de renderizado inicial (se llama una única vez)
	async render() {
		try{
      // Cargar template
      const response = await fetch(this.templateSrc);
      const html = await response.text();
      
      // Crear template y clonar contenido
      this.template = document.createElement('template');
      this.template.innerHTML = html;
      this.fragment = this.template.content.cloneNode(true);

      // Procesar elementos slots
      this.processSlots(this.fragment);
      // Inyectar en shadow DOM
      this.shadow.appendChild(this.fragment);
      // Ejecutar scripts
      await this.processScripts(this.shadow);
      
      // Callback extensible
      this.onConnected();
      
		} catch (error) {
      console.error('Error al cargar el template:', error);
    }
	}
  
  // Envolver código para inyectar contexto
	wrapScriptCode(code) {
	  return `
	    (function(document) {
	      {${code};};
	    }).call(window.component, window.component.shadow);
	  `;
	}
	
	// Ejecutar script en contexto seguro
	executeScript(scriptElement) {
		// Agregar funciones globales al window
		Object.entries(this.Context).forEach(([name, func]) => {
		  if (typeof func === "function") {
	    	window[name] = func;
		  }
		});
		// Agregar contexto al window
		window.ctx = this.Context;
		// Añadir referencia al this en el window
		window.component = this;
	  this.shadow.appendChild(scriptElement); // Inyectar al shadowDOM
	}
  
  // Procesar scripts (static y dynamic)
	async processScripts(fragment) {
	  const scripts = [...fragment.querySelectorAll('script')];
	  scripts.forEach(script => script.remove());
	
	  for (const script of scripts) {
	    const newScript = document.createElement('script');
	    
	    // Copiar atributos
	    script.getAttributeNames().forEach(name => {
	      newScript.setAttribute(name, script.getAttribute(name));
	    });
	
			const isDynamic = script.hasAttribute('data-dynamic');
	    // Procesar script en linea
	    if (script.textContent.trim()) {
				this.processInlineScript(script, newScript, isDynamic, this.shadow);
	    } else if (script.hasAttribute('src')) {
	      await this.processExternalScript(script, newScript, isDynamic, this.shadow);
	    }
	  }
	}
	
	processInlineScript(script, newScript, context = this.shadow) {
		// Inyectar contexto y document
	  const processedCode = this.wrapScriptCode(script.textContent);
	  newScript.textContent = processedCode;
	  
	  // Ejecutar script
	  this.executeScript(newScript, context);
	}
	
	// Procesar scripts externos con caché y TTL
  async processExternalScript(originalScript, newScript, context = this.shadow) {
  	// 1. Obtener el src del script
    const src = originalScript.getAttribute('src');
    
    // 2. Verificar caché y TTL
    if (this.scriptCache.has(src)) {
    	// 2:1. Obtener la cache del src
      const cached = this.scriptCache.get(src);
      // 2:2. Verificar si la cache del src es válida
      const isFresh = (Date.now() - cached.timestamp) < Element.SCRIPT_TTL;
      
      // 2:3. Carga desde cache
      if (isFresh) {
        newScript.src = cached.url;
        this.executeScript(newScript, context);
        return;
      }
      
      // 2:4. Eliminar cache expirado y continuar normalmente
      URL.revokeObjectURL(cached.url);
      this.scriptCache.delete(src);
    }

    // 3. Es un nuevo elemento o cache expirado
    try {
    	// 4. Obtener el código del script
      const response = await fetch(src);
      const text = await response.text();
      
      // 5. Crear blob con código procesado (para cache y poder usar useStates)
      const blobCode = this.wrapScriptCode(text);
      const blob = new Blob([blobCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      
      // 6. Guardar en caché con timestamp
      this.scriptCache.set(src, {
        url,
        timestamp: Date.now()
      });
      
      // 7. Configurar y ejecutar el script
      newScript.src = url; // Como el src es un ObjectURL con Blob, se ejecutará el código directamente
      this.executeScript(newScript, context);
    } catch (error) {
      console.error(`Error al procesar script externo: ${src}`, error);
    }
  }
  
  // Agregar etiquetas de accesibilidad a los slots
  processSlots(fragment) {
    const allSlots = fragment.querySelectorAll('slot');
    allSlots.forEach(slot => {
      // Inicializar ARIA attributes
      slot.setAttribute('aria-live', 'polite');
      slot.setAttribute('aria-relevant', 'additions removals');
    });
  }

	// Actualización dinámica basada en callbacks registrados (Con ViewTransition)
  updateDynamicContent() {
		this.performUpdate();
    this.rendered();
  }

  // Llama a los dynamicCallbacks con el nuevo valor del atributo y re-ejecuta los scripts con data-dynamic
  performUpdate() {
    // Ejecutar callbacks para los atributos con cambios
		Object.entries(this.dynamicCallbacks).forEach((key, { callback, metadata }) => {
			// Si existe el atributo y el valor ha cambiado
			if( this.hasAttribute(key) && this.getAttribute(key) !== metadata.oldData ){
				try {
					// Llamar al callback
          callback(this.getAttribute(key), metadata);
          // Actualizar el metadata con el nuevo valor del Atributo
          metadata.oldData = this.getAttribute(key);
        } catch (error) {
          console.error(`Error en callback para ${key}:`, error);
        }
			}
		});
    
    // Re-ejecutar scripts dinámicos
		this.reexecuteDynamicScripts();
  }
  
  /* Metodos Auxiliares */
  
  // Lazy loading con IntersectionObserver
  initLazyLoading() {
    if (!('IntersectionObserver' in window)) {
      this.loadResources(); // IntersectionObserver no soportado, cargar inmediatamente
      return;
    }

    // Crear observer
    this.intersectionObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        this.loadResources();
        this.intersectionObserver.disconnect(); // Desconectar observer para evitar re-ejecuciones
      }
    }, { rootMargin: '0px 0px 200px 0px' }); // Cargar con anticipación (margin: top right bottom left)
    
    this.intersectionObserver.observe(this); // Observar el componente
  }
  
}