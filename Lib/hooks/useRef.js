import { Hook, HookType } from "./hookObject";

export function useRef(element){
	const refHook = new Hook({
		_elmnt: element,
		get current(){ return this._elmnt; },
		set current(current){ this._elmnt = current; }
	}, HookType.ReferenceHook);
	const currentData = refHook.get();

	const data = {
		_internal: currentData,
		get current(){ return this._internal.current; },
		set current(v){ this._internal.current = v; refHook.patch({_elmnt: v}); }
	};

	return data;
}

