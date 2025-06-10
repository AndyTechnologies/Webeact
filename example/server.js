import express from 'express';
import webeact from '../src/index.js';
import path from 'path';

const app = express();
const PORT = 3000;
const EXAMPLE_DIR = path.join(process.cwd(), 'example');

app.use("/webeact", webeact({logRequest: true}))

app.get('/', (_req, res) => {
	res.sendFile(path.join(EXAMPLE_DIR, 'index.html'));
});

app.listen(PORT, () => {
	console.log(`Servidor corriendo en http://localhost:${PORT} (${process.cwd()})`);
});
