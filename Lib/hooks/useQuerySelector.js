
/**
 * Hace una mediaQuery a nivel de componente
 * @param {string} selector Selector css para buscar el elemento
 * @param {boolean} doBubble Si es true, si el elemento no se encuentra en el componente, lo buscará en el document global
 * @param {boolean} extractSingle Si es true, cuando la querySelector sea un solo elemento, retornará el HTMLElement directamente
 * @returns {Array<HTMLElement> | HTMLElement} los elementos o el elemento html como resultado de la query
 */
export function useQuerySelector(selector, doBubble = false, extractSingle = false) {
	/**
     * @type {NodeList}
     */
	const results = window.doc?.querySelectorAll(selector) ?? (doBubble ? document.querySelectorAll(selector) : new NodeList());

	const values = Array.from(results.values());
	return (extractSingle && results.length === 1)
		? values[0]
		: values;


}

