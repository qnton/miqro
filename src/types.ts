import type { MiddlewareHandler } from "hono";

export type AuthConfig =
	| { type: "none" }
	| { type: "apiKey"; key: string }
	| { type: "bearer"; token: string };

export interface MiqroContext {
	workflowId: string;
	name: string;
	params: Record<string, string>;
	query: Record<string, string | string[]>;
	headers: Record<string, string>;
}

// biome-ignore lint/suspicious/noExplicitAny: Default to any for ease of use without Zod
export interface WorkflowConfig<T = any> {
	id: string;
	name: string;
	description?: string;
	auth: AuthConfig;
	schedule?: string;
	schema?: {
		safeParse: (
			data: unknown,
		) =>
			| { success: true; data: T }
			| { success: false; error: { format: () => unknown } };
	};
}

// biome-ignore lint/suspicious/noExplicitAny: Default to any for ease of use without Zod
export interface Workflow<T = any, R = any> {
	config: WorkflowConfig<T>;
	execute: (payload: T, context: MiqroContext) => Promise<R> | R;
}

export interface MiqroConfig {
	workflowsDir: string; // Absolute path to the user's workflows directory
	port?: number; // Default 3000
	middleware?: MiddlewareHandler[];
}
