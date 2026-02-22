import { app } from '@milkpod/api';
import { cors } from '@elysiajs/cors';
import { node } from '@elysiajs/node';
import 'dotenv/config';
import { Elysia } from 'elysia';

new Elysia({ adapter: node() })
  .use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['X-Thread-Id'],
      credentials: true,
    })
  )
  .use(app)
  .listen(3001, () => {
    console.log('Server is running on http://localhost:3001');
  });
