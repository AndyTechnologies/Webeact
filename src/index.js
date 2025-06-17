import glob from "./iglob.js";
import router from "./router.js";
import cacheEngine from "./view-cache.js";
import path from "path";
const routing = router();

function _loadEnv(envKey, elseName){
	return _envOr(envKey, path.join(process.cwd(), elseName));
}

function _envOr(envKey, elseValue){
	return process.env[envKey] || elseValue;
}

const CMPNAME = _loadEnv("COMPONENTS_DIRECTORY", "components");
const LIBNAME = _loadEnv("LIB_DIRECTORY", "Lib");
const CMPS_REFRESH = _envOr("CMPS_REFRESH", (2.5 * 1000)); // 2.5 segundos
const PRODUCTION = true;

// Servir todos los scripts del lib
routing.use_static(LIBNAME);
routing.use(cacheEngine({
	viewsDirectory: CMPNAME,
	cacheSize: 25,
	isProduction: PRODUCTION || process.env.NODE_ENV === "production",
	streaming: true
}));

routing.get("/connect", async (req, res) => {
	// Cabeceras necesarias para el SSE
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");

	// Mandar un mensaje inicial al cliente
	res.write(`data: Webeact SSE\n\n`);
	const sendEvent = async (data) => {
		let data2send = [];
		for (const filePath of Array.from(data)){
			data2send.push({
				filePath,
				content: await res.webeactViewContent(`${filePath}.html`)
			});
		}
		res.write(`event: update\n`);
		res.write(`data: ${JSON.stringify(data2send)}\n\n`);
	};
	// mandar un mensaje con los archivos detectados
	let data = getFilesNames();
	sendEvent(data);
	// Y luego actualizar cada cierta cantidad de segundos
	const intervalId = setInterval(() => {
		const newDatas = getFilesNames();
		if( !areEquals(data, newDatas) ){
			sendEvent(diffArray(newDatas, data));
			data = newDatas;
		}
	}, CMPS_REFRESH); // actualizar información cada cierta cantidad de segundos

	// When client closes connection, stop sending events
	req.on("close", () => {
		clearInterval(intervalId);
		res.end();
	});
});

function getFilesNames() {
	return glob(
		path.join(CMPNAME, "*.*"),
		(s) => {
			const ss = s.split("/");
			return ss[ss.length - 1].split('.')[0].toLowerCase();
		});
}


/**
 * Retorna los elementos de diferencia entre el arr1 y el arr2
 * @param {Array} arr1 Array a la izquierda de la comparación
 * @param {Array} arr2 Array a la derecha de la comparación
 * @returns {Array} Elementos que están en el arr1 y no en el arr2
 */
function diffArray(arr1, arr2){
	return arr1.filter(v => {return !arr2.includes(v)});
}

/**
 * Verifica que dos arrays sean iguales o no
 * @param {Array} arr1 Array a la izquierda de la comparación
 * @param {Array} arr2 Array a la derecha de la comparación
 */
function areEquals(arr1, arr2){
	// Si son la misma referencia, retorna true
	if( arr1 === arr2 ) return true;
	// Si sus longitudes son iguales
	if( arr1.length === arr2.length )
		// Por cada elemento del arr1
		for(const a of arr1){
			// Verificar que existe en arr2
			if(!arr2.includes(a)) return false;
		}
	return true;
}

/*
Options:
	alwaysCallToNext: after call to the middleware router, always call to the next handler (false)
	logRequest: show request url informations before call middleware
*/
export function createMiddleware(
	options = { alwaysCallToNext: false, logRequest: false },
) {
	return (req, res, next) => {
		if (options.logRequest)
			console.log(`[LOG] - Request ${req.originalUrl} from ${req.ip}`);
		// if the router don´t catch the request, call to next
		if (!routing.middleware(req, res, next) || options.alwaysCallToNext) next();
	};
}

export default createMiddleware;
