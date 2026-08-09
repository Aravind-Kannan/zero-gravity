import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const API_HOST = process.env.API_HOST || 'http://api:3000';

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'frontend' }));
app.get('/status', (req, res) => res.json({ status: 'ok', service: 'frontend' }));

// Forward all /api/* requests directly to API service over private network
app.use('/api', async (req, res) => {
  try {
    const targetUrl = `${API_HOST}/api${req.url}`;
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: { 'Accept': 'application/json' }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'API Gateway Proxy Error', message: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Frontend] Server listening on http://0.0.0.0:${PORT}`);
});
