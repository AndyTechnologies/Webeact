import { Element } from "/webeact/Element.min.js";

window.addEventListener("load", () => {
	
	function useEventSource(url, onMessage, onError, events = {}) {
		const eventSource = new EventSource(url);
		eventSource.onmessage = onMessage;
		eventSource.onerror = onError;
		Object.entries(events).forEach(([event, callback]) => {
			eventSource.addEventListener(event, callback);
		});
		return eventSource;
	}
	
	useEventSource(
		"/webeact/connect", 
		({data}) => { console.log("Conexión establecida:", data); }, 
		event => { console.log("Error en la conexión:", event); },
		// Custom Events
		{
			update: ({data}) => {
				const files = JSON.parse(data);
				files.forEach(file => {
						if (customElements.get(`web-${file}`)) return;
						console.log(`Cargando ${file} como web-${file}...`);
						customElements.define(
							`web-${file}`, 
							class extends Element {
								constructor() {
									super(`/webeact/component/${file}`);
								}
							}
						); // define
				});
			}, // update event
		} 
	);
	
})
