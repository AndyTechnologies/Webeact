import { Element } from "/webeact/Element.js";

function useEventSource(url, onMessage, onError, events = {}) {
	const eventSource = new EventSource(url);
	eventSource.onmessage = onMessage;
	eventSource.onerror = onError;
	Object.entries(events).forEach(([event, callback]) => {
		eventSource.addEventListener(event, callback);
	});
	return eventSource;
}

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
	});
}

window.addEventListener("load", () => {
	let time;
	useEventSource(
		"/webeact/connect",
		({ data }) => {
			time = Date.now();
			console.log("Conexión establecida:", data, `-${time}`);
		},
		(event) => {
			console.log("Error en la conexión:", event);
		},
		// Custom Events
		{
			update: (...args) => {
				const local = Date.now();
				console.log(`Init Update Call: ${local - time}`);
				event_update(...args);
				console.log(`End Update Call: ${Date.now() - local}`);
			}
		}
	);
});
