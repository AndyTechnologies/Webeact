# Webeact 🌐  

>***Una librería para construir interfaces reactivas con web components, inspirada en los hooks de React/Preact y en las plantillas de Astro. Optimizada para integración con servidores Express y SSE.***

![GitHub License](https://badgen.net/github/license/AndyTechnologies/webeact)
![GitHub Contributors](https://badgen.net/github/contributors/AndyTechnologies/webeact)
![GitHub Releases](https://badgen.net/github/release/AndyTechnologies/webeact)
![GitHub Commits](https://badgen.net/github/commits/AndyTechnologies/webeact)
![GitHub Deps](https://badgen.net/github/dependents-repo/AndyTechnologies/webeact)
![Bundlephobia](https://badgen.net/bundlephobia/min/webeact)

---

## 🚀 ¿Qué es Webeact?

Webeact combina la simplicidad de los **web standards** (Custom Elements, Shadow DOM) con un flujo de trabajo familiar para desarrolladores de React, permitiendo crear aplicaciones que aprovechan el **server-side events (SSE)** y el **client-side rendering (CSR)**. Ideal para proyectos pequeños que buscan velocidad, SEO y compatibilidad sin depender de frameworks pesados.

---

## 🔍 Características principales  
- ✅ **React-like hooks**: Usa `useState`, `useEffect` y más con sintaxis intuitiva.  
- 🧱 **Web Components nativos**: Sin transpiladores ni dependencias externas.  
- ⚡ **Renderizado CSR con RealTimeDetection (SSE)**: Utiliza SSE para detectar en tiempo real los componentes creados y CSR para brindar de mayor dinamismo.
- 🔗 **Integración con Express o NodeJS HTTP Server**: Middleware listo para frameworks como express.  
- 📦 **Ligera**: Menos de 10KB minificada.

---

## 📦 Instalación  
```bash
npm install webeact
```

---

## Hooks

- **useState:** 
	> Crea un estado reactivo, y cada vez que cambia se re-renderiza el componente
	```js
	const [count, setCount] = useState(0);
	setCount(1); // re-render
	setCount(v => v+1); // re-render!
	console.log(count); // output: 2 
	```
- **useLocalStorage:**
	> Maneja el local storage en el scope específico de tu componente
	```js
	const [get,set] = useLocalStorage("contador",0);
	set(1); // no re-renderiza!
	set(v => v+1); // tampoco re-renderiza
	// Obtiene el valor actual desde el localStorage
	console.log(get()); // output: 2
	```
- **useState & useLocalStorage:**
	> Combina la gestión de estados, con la persistencia en el local storage
	```js
	const [count, setCount] = useState(0, "counter"); // "counter" = localStorage key
	setCount(1); // Si re-renderiza
	setCount(v => v+1) // También re-renderiza
	// Valor actualizado del estado!
	console.log(count); // output: 2
	```
- **useEffect:**
	> Haz que una función se re-ejecute cada vez que cambien sus dependencias
	```js
	useEffect((nuevo_count) => {
		...
	}, [count])
	```
- **useViewTransition:**
	> Envuelve cualquier función que cambie la UI para hacer una transición. [Más información sobre cómo funcionan las ViewTransitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
	```js
	useViewTransition(() => {
		... cambios en la UI
	})
	```
- **useSSE:**
	> Suscríbete a los servidores que soporten este protocolo para recibir actualizaciones periódicamente. [Más información acerca de los SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
	```js
	useSSE(
		"https://host...",
		(ev) => console.log("Evento anónimo"),
		(ev) => console.error("Error en SSE"),
		{
			custom_event: (ev) => {
				console.log("Custom events!")
			}
		}
	)
	```

---

## ℹ️ Cómo se usa?

En tu proyecto debe haber una carpeta `components` (la carpeta por defectos donde se buscarán los componentes, modificable en las opciones del middleware), luego en tu servidor utiliza el middleware:
```js
import webeact from 'webeact';

// ... inicializar tu aplicación con express

app.use("/webeact", webeact());

// continúa como lo harías normalmente
``` 

Además en tu index.html debes incluir el punto de entrada:
```html
<script type="module" src="/webeact/main.js"></script>
```

## ¡Listo! Ya puedes escribir tus componentes
```html
<h1><slot name="title">Ejemplo de Contador</slot></h1>
<p id="count" name="count"></p>
<button id="counter-plus">+</button>
<button id="counter-minus"> - </button>

<slot name="description"><p>Una descripción</p></slot>

<style>
p#count {
	color: red;
	font-size: 32px;
}
</style>

<script data-dynamic>
    // El data-dynamic es para que se re-ejecute en cada re-renderizado

	// Ahora disponible la API del LocalStorage
	const [getCount, writeCount] = useLocalStorage("counter", 0);

    // Utiliza hooks de react como siempre!
	const [count, setCount] = useState(0);

    // Misma API
	useEffect((cvalue) => {
		document.querySelector("#count").innerHTML = cvalue;
	}, [count]);
	
    // Junto a la API del DOM
	document.querySelector("#counter-plus").addEventListener("click", () => {
		writeCount(v => v + 1);
 		setCount(v => v + 1); // No tiene ViewTransition en los cambios
	});
	
	document.querySelector("#counter-minus").addEventListener("click", () => {
        // Y mucho más
		writeCount(v => v - 1);
		useViewTransition(() => setCount(v => (v <= 0) ? 0 : v - 1));
	});
	
	// Contenido dinámico
	registerDynamicCallback("title", (nv) => {
		document.querySelector("slot[name='title']").innerHTML = nv;
	})

</script>
```

---

## ⚠️ Shadow DOM 
Los componentes se renderizan dentro de un Shadow DOM, esto significa que los estilos globales no afectan a los elementos internos, además los scripts de dentro del Shadow DOM **no tienen acceso directo al DOM global**, pero aún así si pueden acceder mediante `window.document`, así que no bases la seguridad en esto. 

> Para más información acerca de la API de los web components *(template, shadow DOM y custom elements visita)*: **[MDN Web Components](https://developer.mozilla.org/es/docs/Web/API/Web_components)**

