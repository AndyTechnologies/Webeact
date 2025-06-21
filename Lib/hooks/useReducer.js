import { Hook, HookType } from "./hookObject";

export function useReducer(initialReducer, initialState){
	const reducerHook = new Hook({
		reducer: initialReducer,
		state: initialState
	}, HookType.ReducerHook);

	let data = reducerHook.get();

	const dispatch = (action) => {
		const s = data.reducer(data.state, action);
		reducerHook.patch({state: s});
		data = reducerHook.get();
	}

	return [() => data.state, dispatch];
}
