import type { Workflow } from "@qnton/miqro";

const scheduledWorkflow: Workflow = {
	config: {
		id: "hourly-sync-task",
		name: "Hourly Sync Task",
		description:
			"A sample workflow that runs on a schedule instead of webhooks",
		auth: {
			type: "none", // Scheduled jobs might not need webhook auth, but we declare it to satisfy type
		},
		schedule: "* * * * *", // Run every minute for testing
	},

	execute: async (payload, context) => {
		console.log(
			`[${context.workflowId}] Executing scheduled logic: ${context.name}`,
		);
		console.log(`Payload: ${JSON.stringify(payload)}`);

		// Simulate processing
		await Bun.sleep(200);

		console.log(`[${context.workflowId}] Scheduled execution complete.`);
	},
};

export default scheduledWorkflow;
