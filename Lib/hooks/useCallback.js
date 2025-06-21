import { Hook, HookType } from "./hookObject";
import { compareArrays } from "../utils";


/**
 * Si una función retorna el mismo valor, siendo iguales sus parámetros,
 * esto te puede ayudar a cachear esos resultados!
 * @param {function(...):*} fn función a memoizar
 * @returns {*} Resultado de llamar a la función o el cacheado
 */
export function useCallback(fn){
	const callbackHook = new Hook({
		args: [],
		result: undefined,
		callback: fn
	}, HookType.CallbackHook);

	return (...argument) => {
		const {args, result, callback} = callbackHook.get();
		if( compareArrays(argument, args) ) return result;
		const newResult = callback(...argument);
		callbackHook.patch({
			args: argument,
			result: newResult
		});
		return newResult;
	};
}


