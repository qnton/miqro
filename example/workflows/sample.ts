import type { Workflow } from "miqro.js";
import { z } from "zod";

const schema = z.object({
	email: z.string().email(),
	message: z.string().min(5),
	priority: z.enum(["low", "medium", "high"]).default("medium"),
});

const workflow: Workflow<z.infer<typeof schema>> = {
	config: {
		id: "sample-workflow-01",
		name: "Sample Data Processor",
		description: "A sample workflow that logs incoming data",
		auth: {
			type: "bearer",
			token: process.env.SAMPLE_AUTH_TOKEN || "default-secret",
		},
		schema,
	},

	execute: async (payload, context) => {
		console.log(`[${context.workflowId}] Received from ${payload.email}`);
		console.log(`Message: ${payload.message}`);
		console.log(`Priority: ${payload.priority}`);
		console.log(
			`Request ID Header: ${context.headers["x-request-id"] || "N/A"}`,
		);

		// Simulate some async processing
		await Bun.sleep(500);

		console.log(`[${context.workflowId}] Execution complete.`);
	},
};

export default workflow;
