import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { handler as tradesHandler } from './app/deployments/main/wallets/api/trades.js';
import { handler as syncHandler } from './app/deployments/main/wallets/jobs/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// Convert the serverless handler to express middleware
const serverlessToExpress = (handler) => async (req, res) => {
  try {
    const event = {
      httpMethod: req.method,
      path: req.path,
      queryStringParameters: req.query || {},
      body: req.body,
      headers: req.headers,
      validData: req.query || {}, // Pre-validate the data
    };
    
    const result = await handler(event, {});
    
    if (result.statusCode >= 400) {
      res.status(result.statusCode).json(JSON.parse(result.body));
    } else {
      res.status(result.statusCode || 200).json(JSON.parse(result.body));
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

// Routes
app.get('/wallets/trades', serverlessToExpress(tradesHandler));
app.post('/wallets/sync', serverlessToExpress(syncHandler));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
