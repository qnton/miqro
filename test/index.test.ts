import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { startMiqroCore } from "../src/index";
import type { MiqroContext, Workflow } from "../src/types";

// Simulated workflow execution tracker
const executionCounts: Record<string, number> = {
	"webhook-no-auth": 0,
	"webhook-api-key": 0,
	"webhook-bearer": 0,
	"webhook-zod": 0,
	"webhook-context": 0,
};

let lastContext: MiqroContext | null = null;

const mockWorkflows: Workflow[] = [
	{
		config: {
			id: "webhook-no-auth",
			name: "No Auth Workflow",
			auth: { type: "none" },
		},
		execute: (_payload, context) => {
			executionCounts["webhook-no-auth"]++;
			lastContext = context;
		},
	},
	{
		config: {
			id: "webhook-api-key",
			name: "API Key Workflow",
			auth: { type: "apiKey", key: "secret123" },
		},
		execute: (_payload) => {
			executionCounts["webhook-api-key"]++;
		},
	},
	{
		config: {
			id: "webhook-bearer",
			name: "Bearer Token Workflow",
			auth: { type: "bearer", token: "token456" },
		},
		execute: (_payload) => {
			executionCounts["webhook-bearer"]++;
		},
	},
	{
		config: {
			id: "webhook-zod",
			name: "Zod Workflow",
			auth: { type: "none" },
			schema: z.object({
				email: z.string().email(),
				age: z.number().min(18),
			}),
		},
		execute: (_payload) => {
			executionCounts["webhook-zod"]++;
		},
	},
	{
		config: {
			id: "webhook-context",
			name: "Context Workflow",
			auth: { type: "none" },
		},
		execute: (_payload, context) => {
			executionCounts["webhook-context"]++;
			lastContext = context;
		},
	},
];

let middlewareExecuted = false;

describe("Miqro Core API", async () => {
	// We instantiate Miqro once for the test block using our static mock array
	const app = await startMiqroCore(
		{
			port: 3000,
			middleware: [
				async (_c, next) => {
					middlewareExecuted = true;
					await next();
				},
			],
		},
		mockWorkflows,
	);
	const fetch = app.fetch;

	test("GET /health returns 200 OK", async () => {
		const req = new Request("http://localhost:3000/health");
		const res = await fetch(req);

		expect(res.status).toBe(200);
		const data = (await res.json()) as Record<string, unknown>;
		expect(data.status).toBe("ok");
		expect(data.loadedWorkflows).toBe(mockWorkflows.length);
		expect(middlewareExecuted).toBe(true);
	});

	describe("Webhook Routing & Auth", () => {
		// Helper function to simulate a fetch request
		const executeWebhook = async (
			workflowId: string,
			headers: HeadersInit = {},
			body: unknown = { testPayload: true },
		) => {
			const req = new Request(`http://localhost:3000/${workflowId}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
				body: JSON.stringify(body),
			});
			return await fetch(req);
		};

		test("Returns 404 for unknown workflow id", async () => {
			const res = await executeWebhook("some-fake-id");
			expect(res.status).toBe(404);
		});

		test("Returns 400 for bad JSON payload", async () => {
			const req = new Request(`http://localhost:3000/webhook-no-auth`, {
				method: "POST",
				body: "{ bad_json }",
			});
			const res = await fetch(req);
			expect(res.status).toBe(400);
		});

		test("Executes successfully with No Auth", async () => {
			const previousCount = executionCounts["webhook-no-auth"];
			const res = await executeWebhook("webhook-no-auth");

			expect(res.status).toBe(200);
			const data = (await res.json()) as Record<string, unknown>;
			expect(data.status).toBe("success");
			expect(executionCounts["webhook-no-auth"]).toBe(previousCount + 1);
		});

		describe("API Key Authentication", () => {
			test("Fails with 401 if missing API Key", async () => {
				const res = await executeWebhook("webhook-api-key");
				expect(res.status).toBe(401);
			});

			test("Fails with 401 if incorrect API Key", async () => {
				const res = await executeWebhook("webhook-api-key", {
					"x-api-key": "wrong-key",
				});
				expect(res.status).toBe(401);
			});

			test("Succeeds with correct API Key", async () => {
				const previousCount = executionCounts["webhook-api-key"];
				const res = await executeWebhook("webhook-api-key", {
					"x-api-key": "secret123",
				});
				expect(res.status).toBe(200);
				expect(executionCounts["webhook-api-key"]).toBe(previousCount + 1);
			});
		});

		describe("Bearer Token Authentication", () => {
			test("Fails with 401 if missing Bearer Token", async () => {
				const res = await executeWebhook("webhook-bearer");
				expect(res.status).toBe(401);
			});

			test("Fails with 401 if incorrect Bearer Token", async () => {
				const res = await executeWebhook("webhook-bearer", {
					Authorization: "Bearer wrong-token",
				});
				expect(res.status).toBe(401);
			});

			test("Succeeds with correct Bearer Token", async () => {
				const previousCount = executionCounts["webhook-bearer"];
				const res = await executeWebhook("webhook-bearer", {
					Authorization: "Bearer token456",
				});
				expect(res.status).toBe(200);
				expect(executionCounts["webhook-bearer"]).toBe(previousCount + 1);
			});
		});

		describe("Zod Validation", () => {
			test("Fails with 400 if validation fails", async () => {
				const res = await executeWebhook(
					"webhook-zod",
					{},
					{ email: "invalid", age: 10 },
				);
				expect(res.status).toBe(400);
				const data = (await res.json()) as { error: string };
				expect(data.error).toBe("Validation Failed");
			});

			test("Succeeds with 200 if validation passes", async () => {
				const previousCount = executionCounts["webhook-zod"];
				const res = await executeWebhook(
					"webhook-zod",
					{},
					{ email: "test@example.com", age: 25 },
				);
				expect(res.status).toBe(200);
				expect(executionCounts["webhook-zod"]).toBe(previousCount + 1);
			});
		});

		describe("Execution Context", () => {
			test("Passes correct context data", async () => {
				const res = await executeWebhook(
					"webhook-context",
					{ "x-test": "header-val" },
					{ foo: "bar" },
				);
				expect(res.status).toBe(200);
				expect(lastContext).not.toBeNull();
				if (lastContext) {
					expect(lastContext.workflowId).toBe("webhook-context");
					expect(lastContext.name).toBe("Context Workflow");
					expect(lastContext.headers["x-test"]).toBe("header-val");
				}
			});
		});
	});
});
