import { Hook, HookType } from "./hookObject";
import { useRef } from "./useRef";
import { useEffect } from "./useEffect";
import { useQuerySelector } from "./useQuerySelector";


/**
 * Crea un EventListener que se le agrega a un elemento del DOM una sola vez entre re-renderizados
 * @param {string} eventName Nombre del evento que va a escuchar el handler
 * @param {function(*):void} handler Función que recibe el objeto evento cuando ocurre
 * @param {undefined|string|[*]|Object} element Elemento que al que se le suscribe el evento (por defecto window)
 * @param {Object} options Opciones que se le pasan al addEventListener
 */
export function useEventListener(
	eventName,
	handler,
	element,
	options
){

	// Tratamiento del Element
	if(typeof element === "string") {
		// Si es un string, es una query (useRef obligatoria para el useEventListener)
		element = useRef( useQuerySelector(element, false, true) );
		return useEventListener(eventName, handler, element, options);
	}else if( Array.isArray(element) ){
		// Si es un array de elementos, se pueden combinar HTMLElement y query's selectors
		Array.from(element)
		// Transforma cada elemento en función de que sean queryStrings/HTMLElement
		.map(v => (typeof v === "string") ? v : useRef(v))
		// LLamar a useEventListener por cada elemento
		.forEach((v)=> useEventListener(eventName, handler, v, options));
		return;
	}else if( Array.isArray(element.current) ){
		// Si tenemos una referencia a un Array, entonces debe ser un Array de HTMLElement's
		Array.from(element.current)
		// Transforma cada HTMLElement en una referencia a ese HTMLElement
		.map(v => useRef(v))
		// LLamar a useEventListener por cada elemento
		.forEach((v)=> useEventListener(eventName, handler, v, options));
		return;
	}

	const eventListenerHook = new Hook({
		eventName: eventName,
		handler: handler,
		element: element,
		options: options
	}, HookType.EventListenerHook);

	const data = eventListenerHook.get();

	const savedHandler = useRef(data.handler);

	useEffect((newHandler) => {
		savedHandler.current = newHandler;
		data.handler = savedHandler;
	}, [handler]);

	useEffect(() => {
		const targetElement = data.element?.current ?? window;
		if (!(targetElement && targetElement.addEventListener)) return;

		const listener = event => {
			savedHandler.current(event)
		}

		targetElement.addEventListener(data.eventName, listener, data.options);

		return () => {
			targetElement.removeEventListener(data.eventName, listener, data.options)
		}
	}, [eventName, element, options]);

}



