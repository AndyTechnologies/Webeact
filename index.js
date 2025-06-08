import express from 'express';
import path from 'path';
import { glob } from 'glob';
import * as fs from 'fs';

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
  const files = await glob(path.join(CMPNAME, '*.*'))
	
	res.send(files
		.map(s => s.split("/"))
		.map(s => s[s.length - 1])
		.map(s => s.split(".")[0])
		.map(s => s.toLowerCase())
	); // res.send
}); // app.get

export function mountWebeact (ExpressApp) {
	ExpressApp.use('/webeact', app);
	return app;
};

export default {
	mountWebeact,
	CMPNAME,
	LIBNAME
};