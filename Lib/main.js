import { Element } from "/webeact/Element.js";

/**
 * Helper para SSE
 * @param {string} url direccion a donse conectarse
 * @param {Function} onMessage callback para eventos sin nombre
 * @param {Function} onError callback para errores
 * @param {Object} events eventos personalizables
 * @returns {EventSource}
 */
function useEventSource(url, onMessage, onError, events = {}) {
	const eventSource = new EventSource(url);
	eventSource.onmessage = onMessage;
	eventSource.onerror = onError;
	Object.entries(events).forEach(([event, callback]) => {
		eventSource.addEventListener(event, callback);
	});
	return eventSource;
}

/**
 * Función para el CustomEvent: update
 * @param {Object} param0 objeto con la key data donde está el array con cada file y su contenido
 */
function event_update({ data }) {
	const files = JSON.parse(data);
	files.forEach(({filePath, content}) => {
		if (customElements.get(`web-${filePath}`)) return;
		console.log(`Cargando ${filePath} como web-${filePath}...`);
		customElements.define(
			`web-${filePath}`,
			class extends Element {
				constructor() {
					super(content);
				}
			}
		); // define
		if( filePath === "main-app" && customElements.get("web-main-app") ) mountMainApp();
	});
}

window.addEventListener("DOMContentLoaded", () => {
	useEventSource(
		"/webeact/connect",
		({ data }) => {
			console.log("Conexión establecida:", data, `-> ${Date.now()}`);
		},
		(event) => {
			console.log("Error en la conexión:", event);
		},
		// Custom Events
		{ update: event_update }
	);
})

let mainApp = document.querySelector("web-main-app");
function mountMainApp(){
	if(mainApp !== null) return;

	console.log("Mounting main app...");
	mainApp = document.createElement("web-main-app");
	while(!mainApp) mainApp = document.createElement("web-main-app");
	try {
		document.body.prepend(mainApp);
	} catch (error) {
		console.error(`Error mounting main app: ${error}`);
	}
}
