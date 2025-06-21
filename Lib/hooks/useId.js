import { Hook, HookType } from "./hookObject";

/**
 * Genera un identificador único
 * @returns {string} random id
 */
export function useId() {
	const idHook = new Hook({
		timestamp: Date.now(),
		zone: Date.now().toExponential(),
		salt: Number.parseInt((Math.PI * (Math.random() * 1000)).toLocaleString())
	}, HookType.IDHook);

	const datas = idHook.get();
	const salt = btoa(`${datas.timestamp}${datas.zone}-${datas.salt}`.trim());
	return `wid-${salt}`;
}
