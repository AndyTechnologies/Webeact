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

## ℹ️ Cómo se usa?

En tu proyecto debe haber una carpeta `components` (la carpeta por defectos donde se buscarán los componentes, modificable por la variable de entorno COMPONENTS_DIRECTORY), luego en tu servidor utiliza el middleware:
```js
import webeact from '../src/index.js';

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

    // Utiliza hooks de react como siempre!
	const [count, setCount] = useState(0);

    // Misma API
	useEffect((cvalue) => {
		document.querySelector("#count").innerHTML = cvalue;
	}, [count]);
	
    // Junto a la API del DOM
	document.querySelector("#counter-plus").addEventListener("click", () => {
 		setCount(v => v + 1); // No tiene ViewTransition en los cambios
	});
	
	document.querySelector("#counter-minus").addEventListener("click", () => {
        // Y mucho más
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

