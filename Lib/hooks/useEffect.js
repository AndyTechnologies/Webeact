import { Hook, HookType } from "./hookObject";

/**
* Hook para que una función se ejecute 1 vez (la primera vez)
* y después solo cuando cambien sus params
* @param {Function} effect Función que se ejecuta
* @param {Array} dependencies Dependencias para que se re-ejecute la función
* @returns {Array} array que contiene la función para limpiar el effect y la instancia del hook
*/
export function useEffect(effect, dependencies = []) {
	const effectHook = new Hook({
		effect: effect,
		cleanup: null,
		dependencies: [...dependencies],
		hasRun: false,
		isActive: true
	}, HookType.EffectHook);

	const dependenciesChanged = (oldDeps, newDeps) => {
		if (oldDeps.length !== newDeps.length) return true;
		return oldDeps.some((dep, index) => dep !== newDeps[index]);
	};

	const runEffect = () => {
		const data = effectHook.get();
		if (!data || !data.isActive) return;

		try {
			if (data.cleanup && typeof data.cleanup === 'function') {
				data.cleanup();
			}

			const cleanup = data.effect( ...data.dependencies );
			effectHook.patch({
				cleanup: typeof cleanup === 'function' ? cleanup : null,
				hasRun: true
			});
		} catch (error) {
			console.error('Error in effect execution:', error);
		}
	};

	// Ejecutar solo si las dependencias cambiaron
	const data = effectHook.get();
	if (!data.hasRun || dependenciesChanged(data.dependencies, dependencies)) {
		effectHook.patch({ dependencies: [...dependencies] });
		runEffect();
	}

	return {
		cleanup: () => {
			const data = effectHook.get();
			if (data?.cleanup) data.cleanup();
			effectHook.destroy();
		},
		hookInstance: effectHook
	};
}
