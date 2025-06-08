import express from 'express';
import path from 'path';
import { glob } from 'glob';
import * as fs from 'fs';

const app = express.Router("/webeact/api");

export const DIRNAME = process.env.PUBLIC_DIRECTORY || path.join(process.cwd(), 'public');
export const CMPNAME = process.env.COMPONENTS_DIRECTORY || path.join(process.cwd(), 'components');

function renderComponent(name,attrs) {
	const template = fs.readFileSync(`${CMPNAME}/${name}.html`, 'utf-8');
	let rendered = template;
	Object.entries(attrs).forEach(([key,value]) => {
		rendered = rendered.replace(new RegExp(`{{${key}}`, 'g'), value);
	})
	return rendered;
}

// Servir archivos estáticos (HTML, CSS, JS)
app.use(express.static(DIRNAME));

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

export default app;