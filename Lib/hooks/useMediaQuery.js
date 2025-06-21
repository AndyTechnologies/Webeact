import { Hook, HookType } from "./hookObject";

/**
 *
 * @param {string} mediaQuery Texto que define una media query
 * @returns {[boolean, MediaQueryList]} si la media query dio válida o no, y la queryList correspondiente
 */
export function useMediaQuery(mediaQuery){
	const mediaQueryHook = new Hook({
		query: mediaQuery,
		queryList: window.matchMedia(mediaQuery)
	}, HookType.MediaQueryHook);

	let {query, queryList} = mediaQueryHook.get();
	if( !(query && query === mediaQuery) ){
		query = mediaQuery;
		queryList = window.matchMedia(query);
		mediaQueryHook.patch({query, queryList});
	}

	return [queryList.matches, queryList];

}
