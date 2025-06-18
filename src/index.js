import { glob } from "./iglob.js";
import { diffArray, areEquals } from "./array_utils.js";
import { cacheEngine } from "./view-cache.js";
import { router } from "./router.js";

import path from "path";
const routing = router();

/**
 * Carga una variable de entorno o retrona un path absoluto al elseName
 * @param {string} envKey Llave de la variable de entorno a cargar
 * @param {string} elseName path que se junta al process.cwd si la variable de entorno no existe
 * @returns {*} valor final extraída desde la variable de entorno
 */
function _loadEnv(envKey, elseName){
	const res = _envOr(envKey, path.join(process.cwd(), elseName));
	console.log(`[LOAD ENV]: ${envKey}: ${res}`);
	return res;
}

/**
 * Carga una variable de entorno o retrona elseValue
 * @param {string} envKey Llave de la variable de entorno a cargar
 * @param {*} elseValue valor a retronar si no existe la variable de entorno
 * @returns {*} el valor de la variable de entorno envKey o el valor elseValue
 */
function _envOr(envKey, elseValue){
	return process.env[envKey] || elseValue;
}

/**
 * Path del directorio de donde se cargan los componentes (configurable)
 */
let CMPNAME = _loadEnv("COMPONENTS_DIRECTORY", "components");
/**
 * La dirección de dónde se cargan los archivos del cliente necesarios para webeact
 */
const LIBNAME = path.join(process.cwd(), "node_modules/webeact/Lib");
/**
 * El ratio de refresco para detectar componentes nuevos
 */
const CMPS_REFRESH = _envOr("CMPS_REFRESH", (2.5 * 1000)); // 2.5 segundos
/**
 * Si es en producción o no
 */
const PRODUCTION = _envOr("PRODUCTION", true);

// Servir todos los scripts del lib
routing.use_static(LIBNAME);

/**
 * Habilita el SSE (server side events / eventos enviados desde el servidor)
 * @param {Request} req Información sobre la petición
 * @param {Response} res Información sobre la respuesta
 */
async function handleSSE(req,res) {
	// Cabeceras necesarias para el SSE
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");

	// Mandar un mensaje inicial al cliente
	res.write(`data: Webeact SSE\n\n`);
	// lógica de mandar un evento con los datos de los ficheros
	const sendEvent = async (data) => {
		let data2send = [];
		for (const filePath of Array.from(data)) {
			// por cada fichero de componente obtenemos su nombre y su contenido
			data2send.push({
				filePath,
				content: await res.webeactViewContent(`${filePath}.html`)
			});
		}
		res.write(`event: update\n`);
		res.write(`data: ${JSON.stringify(data2send)}\n\n`);
	};

	// mandar un mensaje con los archivos detectados
	let data = await getFilesNames(); // cacheamos los archivos ya enviados
	sendEvent(data);

	// Y luego actualizar cada cierta cantidad de segundos
	const intervalId = setInterval(() => {
		getFilesNames().then(newDatas => {
			// Verificar que hayan nuevos componentes
			if (!areEquals(data, newDatas)) {
				// Y enviar solo la diferencia
				newDatas = diffArray(newDatas, data);
				sendEvent(newDatas);
				data.push(...newDatas); // actualizar la lista de los componentes
			}
		}).catch(err => console.error(`Error on getting files names: ${err}`));
	}, CMPS_REFRESH); // actualizar información cada cierta cantidad de segundos

	// When client closes connection, stop sending events
	req.on("close", () => {
		clearInterval(intervalId);
		res.end();
	});
}

routing.get("/connect", handleSSE);

/**
 * Retorna el nombre de todos los componentes (nombre de los archivos sin sus extensiones)
 * @returns {Promise<Array>} array con los nombres de los ficheros en la carpeta components configurada
 */
async function getFilesNames() {
	return await glob(
		path.join(CMPNAME, "*.*"),
		(s) => {
			const ss = s.split("/");
			return ss[ss.length - 1].split('.')[0].toLowerCase();
		});
}

/**
 * @typedef WebeactMiddlewareOptions
 * @property {boolean} alwaysCallToNext siempre llamar al siguiente handler (next)
 * @property {boolean} logRequest imprimir en consola información relevante de las requests
 * @property {string} componentsDirectory cambiar el directorio donde se buscan los componentes (por defecto 'components')
 */


/**
 * Crear el middleware para el servidor (lógica de webeact)
 * @param {WebeactMiddlewareOptions} options objeto con opciones varias
 * @returns {Function} middleware con la logica del router interno
 */
export function createMiddleware(
	options = { alwaysCallToNext: false, logRequest: false, componentsDirectory: CMPNAME },
) {
	CMPNAME = options.componentsDirectory || CMPNAME;
	routing.use(cacheEngine({
		viewsDirectory: options.componentsDirectory || CMPNAME,
		cacheSize: 25,
		isProduction: PRODUCTION || process.env.NODE_ENV === "production"
	}));

	return (req, res, next) => {
		if (options.logRequest)
			console.log(`[LOG] - Request ${req.originalUrl} from ${req.ip}`);
		if (!routing.middleware(req, res, next) || options.alwaysCallToNext) next();
	};
}

export default createMiddleware;
