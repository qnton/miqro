# Miqro

A minimal, high-performance microservice engine built on [Bun](https://bun.sh/) and [Hono](https://hono.dev/).
Designed to process webhooks and run scheduled cron jobs utilizing file-based workflow configurations with first-class TypeScript support and Zod validation.

## Key Features

- **High Performance:** Powered by Bun and Hono.
- **Developer Friendly:** Built-in CLI for scaffolding and development.
- **Zod Validation:** Automatic request validation for your webhooks.
- **Security First:** Simple API Key and Bearer Token authentication.
- **Scheduled Jobs:** Native support for cron-based workflows.
- **Middleware Support:** Easily extend the engine with Hono middleware.
- **Single File Builds:** Bundle your entire project into a single executable artifact.

## Quick Start

Create a new project automatically in your current directory:
```bash
bunx miqro.js init
bun add miqro.js
```

This creates a `miqro.config.ts`, a `workflows/` directory, and configures your environment.

Start the development server with hot-reloading:
```bash
bun run dev
```

## Commands

- `miqro init`: Scaffolds a new project.
- `miqro dev`: Starts the engine in development mode with hot-reloading.
- `miqro start`: Starts the engine for production.
- `miqro build`: Compiles your project into a single standalone file at `./dist/index.js`.

## Configuration

The engine is configured via `miqro.config.ts`:

```typescript
import type { MiqroConfig } from 'miqro.js';

export default {
  port: 3000,
  workflowsDir: './workflows',
  middleware: [
    async (c, next) => {
      console.log(`[${c.req.method}] ${c.req.url}`);
      await next();
    }
  ]
} satisfies MiqroConfig;
```

## Workflows

### Webhook Workflow with Validation

Webhooks respond to `POST /{id}`. Use **Zod** to validate your payloads and get full type safety in your execution logic.

```typescript
import { z } from "zod";
import type { Workflow } from "miqro.js";

export default {
  config: {
    id: 'process-payment',
    name: 'Payment Webhook',
    auth: { type: 'apiKey', key: process.env.API_KEY || 'secret' },
    schema: z.object({
      amount: z.number().positive(),
      currency: z.string().length(3),
      customerEmail: z.string().email(),
    })
  },
  execute: async (payload, context) => {
    // payload is automatically typed based on the schema!
    console.log(`Processing ${payload.amount} ${payload.currency} for ${payload.customerEmail}`);
    
    // access request metadata via context
    console.log(`User Agent: ${context.headers['user-agent']}`);
  }
} satisfies Workflow;
```

### Scheduled Cron Workflow

If a workflow config provides a `schedule` property (a valid Cron string), it will be executed automatically.

```typescript
import type { Workflow } from 'miqro.js';

export default {
  config: {
    id: 'daily-cleanup',
    name: 'Database Cleanup',
    auth: { type: 'none' }, 
    schedule: '0 0 * * *' // Runs every night at midnight
  },
  execute: async (payload, context) => {
    console.log(`Running scheduled cleanup for ${context.name}...`);
  }
} satisfies Workflow;
```

## Execution Context

The `execute` function receives a `MiqroContext` object providing access to:

- `workflowId`: The ID of the current workflow.
- `name`: The display name of the workflow.
- `params`: Route parameters.
- `query`: URL query parameters.
- `headers`: HTTP Request headers.