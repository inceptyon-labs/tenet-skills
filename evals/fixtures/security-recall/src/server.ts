import express from 'express';
import cors from 'cors';

const app = express();

// PLANT SEC-CORS-001: wildcard origin combined with credentials:true ->
// any site can make credentialed cross-origin requests
app.use(cors({ origin: '*', credentials: true }));

app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(3000, () => {
  console.log('listening on :3000');
});

export default app;
