import express from 'express';
import { glob } from 'glob';
import path from 'node:path';
import * as fs from 'node:fs';

const app = express.Router();

export const CMPNAME = process.env.COMPONENTS_DIRECTORY || path.join(process.cwd(), 'components');
export const LIBNAME = process.env.LIB_DIRECTORY || path.join(process.cwd(), 'Lib');

function renderComponent(name,attrs) {
	const template = fs.readFileSync(`${CMPNAME}/${name}.html`, 'utf-8');
	let rendered = template;
	Object.entries(attrs).forEach(([key,value]) => {
		rendered = rendered.replace(new RegExp(`{{${key}}`, 'g'), value);
	})
	return rendered;
}

// Servir todos los scripts del lib
app.use(express.static(LIBNAME))

app.get('/component/:name', async (req, res) => {
	const componentName = req.params.name;
	const attrs = req.query;
	const html = renderComponent(componentName, attrs);
	res.send(`${html}`);
})

app.get('/files', async (_req, res) => {
	res.send(await getFilesNames());
}); // app.get


app.get("/connect", async (req, res) => {
	// Cabeceras necesarias para el SSE
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');

	// Mandar un mensaje inicial al cliente
	res.write(`data: Webeact SSE\n\n`);
	const sendEvent = data => {
    		res.write(`event: update\n`);
      	res.write(`data: ${JSON.stringify(data)}\n\n`);
	}

	// mandar un mensaje con los archivos detectados
	sendEvent(await getFilesNames())
	// Y luego actualizar cada 2.5 segundos
	const intervalId = setInterval(async () => {
    	sendEvent(await getFilesNames())
	}, 2500); // actualizar información cada 2.5 segundos

	// When client closes connection, stop sending events
	req.on('close', () => {
		clearInterval(intervalId);
		res.end();
	});
});

async function getFilesNames() {
	return (await glob(path.join(CMPNAME, '*.*')))
		.map(s => s.split("/"))
		.map(s => s[s.length - 1])
		.map(s => s.split(".")[0])
		.map(s => s.toLowerCase());
}

export function mountWebeact (ExpressApp) {
	ExpressApp.use('/webeact', app);
	return app;
};

export default {
	mountWebeact,
	CMPNAME,
	LIBNAME
};
