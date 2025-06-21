import { Hook, HookType } from "./hookObject";
import { compareArrays } from "../utils";

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
