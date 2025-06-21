import { Hook, HookType } from "./hookObject";

/**
 * Toma un grupo de acciones y los encapsula en un estado
 * @param {function(*, string):*} initialReducer Función que recibe un estado, y una acción, y retorna un nuevo estado
 * @param {*} initialState El estado inicial
 * @returns {[function():*, function(*, string):*]} devuelve una función que obtiene el estado actual, y el dispatch
 */
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
