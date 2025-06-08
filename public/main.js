import { Element } from "/Lib/Element.js";

window.addEventListener("load", () => {
	console.log("Cargando componentes...");
	fetch("/webeact/api/files").then(res => res.json()).then(res => {
			res.forEach(file => {
				console.log(`Cargando ${file} como web-${file}...`);
				customElements.define(
					`web-${file}`, 
					class extends Element {
						constructor() {
							super(`/webeact/api/component/${file}`);
						}
					}
				); // define
			});
			console.log("Componentes cargados");
	});
})
