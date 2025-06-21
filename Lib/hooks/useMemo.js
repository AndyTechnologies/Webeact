import { Hook, HookType } from "./hookObject";
import { compareArrays } from "../utils";

/**
 * Toma una funcion y las dependencias de esta, mientras que no haya cambios en las dependencias, cachea el resultado
 * @param {function} fn Función que hace un cálculo pesado
 * @param {[*]} dependencies las dependencias de ese cálculo
 * @returns {*} resultado cacheado o re-calculado por la función
 */
export function useMemo(fn, dependencies = []){
	const memoHook = new Hook({
		result: undefined,
		callback: fn,
		deps: dependencies
	}, HookType.MemoHook);

	const datas = memoHook.get();

	if( !compareArrays(datas.deps, dependencies) ){
		const r = datas.callback(...dependencies);
		memoHook.patch({
			result: r,
			deps: dependencies
		});
	}

	return memoHook.get().result;
}
