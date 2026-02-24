import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { logger } from "hono/logger";
import cron from "node-cron";
import type { MiqroConfig, Workflow } from "./types";

// Autoload all workflows from the specified directory
async function loadWorkflows(workflowsDir: string): Promise<Record<string, Workflow>> {
  const workflows: Record<string, Workflow> = {};

  try {
    const files = await readdir(workflowsDir);

    for (const file of files) {
      if (file.endsWith(".ts") || file.endsWith(".js")) {
        const modulePath = join(workflowsDir, file);
        // Dynamically import the workflow file
        const importedModule = await import(modulePath);
        const workflow: Workflow = importedModule.default;

        if (workflow?.config?.id) {
          workflows[workflow.config.id] = workflow;
          console.log(`[Miqro] Loaded workflow: ${workflow.config.id} (${file})`);

          // If the workflow defines a schedule, register it with node-cron
          if (workflow.config.schedule) {
            cron.schedule(workflow.config.schedule, () => {
              console.log(`[Cron] Executing scheduled workflow: ${workflow.config.id}`);
              const payload = { source: "cron", timestamp: Date.now() };
              const context = {
                workflowId: workflow.config.id,
                name: workflow.config.name,
                params: {},
                query: {},
                headers: {}
              };
              workflow.execute(payload, context);
            });
            console.log(
              `[Miqro] Scheduled workflow '${workflow.config.id}' with cron: '${workflow.config.schedule}'`
            );
          }
        }
      }
    }
  } catch (error) {
    console.error(`[Miqro] Error loading workflows from ${workflowsDir}:`, error);
  }

  return workflows;
}

/**
 * Core initialization logic that takes a pre-loaded array of workflows.
 * Useful for static bundlers.
 */
export async function startMiqroCore(
  config: Omit<MiqroConfig, "workflowsDir">,
  staticWorkflows: Workflow[]
) {
  const workflows: Record<string, Workflow> = {};

  for (const workflow of staticWorkflows) {
    if (workflow?.config?.id) {
      workflows[workflow.config.id] = workflow;
      console.log(`[Miqro] Loaded workflow: ${workflow.config.id}`);

      if (workflow.config.schedule) {
        cron.schedule(workflow.config.schedule, () => {
          console.log(`[Cron] Executing scheduled workflow: ${workflow.config.id}`);
          const payload = { source: "cron", timestamp: Date.now() };
          const context = {
            workflowId: workflow.config.id,
            name: workflow.config.name,
            params: {},
            query: {},
            headers: {}
          };
          workflow.execute(payload, context);
        });
        console.log(
          `[Miqro] Scheduled workflow '${workflow.config.id}' with cron: '${workflow.config.schedule}'`
        );
      }
    }
  }

  const app = new Hono();

  app.use("*", logger());

  // Apply user-defined middleware
  if (config.middleware) {
    for (const mw of config.middleware) {
      app.use("*", mw);
    }
  }

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      uptime: process.uptime(),
      loadedWorkflows: Object.keys(workflows).length
    })
  );

  // Generic webhook endpoint
  app.post("/:workflowId", async (c) => {
    try {
      const workflowId = c.req.param("workflowId");
      const workflow = workflows[workflowId];

      if (!workflow) {
        return c.json({ error: `Workflow '${workflowId}' not found` }, 404);
      }

      // Basic Auth Check based on workflow config
      const authHeader = c.req.header("Authorization");
      const { auth } = workflow.config;

      if (auth.type === "apiKey") {
        const apiKey = c.req.header("x-api-key") || c.req.query("apiKey");
        if (apiKey !== auth.key) {
          return c.json({ error: "Unauthorized: Invalid API Key" }, 401);
        }
      } else if (auth.type === "bearer") {
        if (!authHeader || !authHeader.startsWith(`Bearer ${auth.token}`)) {
          return c.json({ error: "Unauthorized: Invalid Bearer token" }, 401);
        }
      }

      let payload = await c.req.json();

      // Zod Validation if schema is provided
      if (workflow.config.schema) {
        const result = workflow.config.schema.safeParse(payload);
        if (!result.success) {
          return c.json(
            {
              error: "Validation Failed",
              details: result.error.format()
            },
            400
          );
        }
        payload = result.data;
      }

      // Construct Context
      const context = {
        workflowId: workflow.config.id,
        name: workflow.config.name,
        params: c.req.param(),
        query: c.req.query(),
        headers: c.req.header()
      };

      // Execute workflow
      const result = await workflow.execute(payload, context);

      return c.json({
        status: "success",
        message: `Workflow '${workflowId}' executed`,
        data: result
      });
    } catch (error) {
      console.error("[Miqro Webhook Error]", error);
      return c.json({ error: "Invalid JSON payload or internal error" }, 400);
    }
  });

  const port = config.port || process.env.PORT || 3000;

  console.log(`🚀 Miqro started on http://localhost:${port}`);
  if (Object.keys(workflows).length > 0) {
    console.log(
      `Active Webhooks: \n${Object.keys(workflows)
        .map((w) => ` - POST http://localhost:${port}/${w}`)
        .join("\n")}`
    );
  } else {
    console.log(`No workflows loaded.`);
  }

  return {
    port,
    fetch: app.fetch
  };
}

/**
 * Initializes and starts the Miqro application dynamically using a directory.
 */
export async function startMiqro(config: MiqroConfig) {
  const loadedWorkflowMap = await loadWorkflows(config.workflowsDir);
  return startMiqroCore(config, Object.values(loadedWorkflowMap));
}

export type {
  AuthConfig,
  MiqroConfig,
  Workflow,
  WorkflowConfig
} from "./types";
