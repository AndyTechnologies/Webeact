import express from 'express';
import webeact from './index.js';

const app = express();
const PORT = 3000;

app.use(webeact);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT} (${DIRNAME})`);
});