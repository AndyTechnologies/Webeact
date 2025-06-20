import { Hook, HookType } from "./hookObject";

/**
* Crea una view transition para una actualización
* dinámica de elementos por updateUI
* @param {Function} updateUI función que va a actualizar la UI (Luego de esto se ejecutarán todos los listeners)
* @param {Function} onReady función que será llamada cuando la transición termine con éxito (si falla no)
* @param {Function} onFinish función que será llamada cuando la transición termine
* @returns {Array} un Array dónde la 1ra posición es la función que realiza la transition, y la segunda un objeto con el subscribe y el hook
*/
export function useViewTransition(updateUI, onReady, onFinish){
	const transitionHook = new Hook({
		onRender: updateUI,
		onReady, onFinish
	}, HookType.TransitionHook);

	const doTransition = () => {
		const data = transitionHook.get();
		const transition = document.startViewTransition(() => {
			data.onRender?.();
		});
		transition.ready.then(() => {
			const data = transitionHook.get();
			data.onReady?.(transitionHook);
		})
		transition.finished.then(() => {
			const data = transitionHook.get();
			data.onFinish?.(transitionHook);
		})
		return transition;
	};

	return [
		doTransition,
		{hook: transitionHook}
	];
}

