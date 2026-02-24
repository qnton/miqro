#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { startMiqro } from "./index";

async function main() {
	const { positionals } = parseArgs({
		args: Bun.argv.slice(2),
		allowPositionals: true,
	});

	const command = positionals[0] || "start";

	if (command === "init") {
		const configPath = resolve(process.cwd(), "miqro.config.ts");
		if (existsSync(configPath)) {
			console.error(
				`❌ miqro.config.ts already exists in the current directory.`,
			);
			process.exit(1);
		}

		const defaultConfig = `import type { MiqroConfig } from "@qnton/miqro";

export default {
  port: 3000,
  workflowsDir: "./workflows",
} satisfies MiqroConfig;
`;
		await writeFile(configPath, defaultConfig);

		const workflowsPath = resolve(process.cwd(), "workflows");
		if (!existsSync(workflowsPath)) {
			await mkdir(workflowsPath, { recursive: true });
		}

		// Create a sample workflow if none exist
		const sampleWorkflowPath = resolve(workflowsPath, "sample.ts");
		if (!existsSync(sampleWorkflowPath)) {
			const sampleWorkflow = `import type { Workflow } from "@qnton/miqro";

const workflow: Workflow = {
  config: {
    id: "hello-world",
    name: "Hello World Workflow",
    auth: { type: "none" },
  },
  execute: async (payload: { message: string }, context) => {
    console.log("Hello from Miqro!", payload.message);
    console.log("Context workflow ID:", context.workflowId);
  },
};

export default workflow;
`;
			await writeFile(sampleWorkflowPath, sampleWorkflow);
		}

		// Create a basic package.json if it doesn't exist
		const pkgPath = resolve(process.cwd(), "package.json");
		if (!existsSync(pkgPath)) {
			const pkgContent = {
				name: "miqro-project",
				type: "module",
				dependencies: {
					"@qnton/miqro": "^0.2.2"
				},
				scripts: {
					dev: "miqro dev",
					start: "miqro start",
					build: "miqro build",
				},
			};
			await writeFile(pkgPath, JSON.stringify(pkgContent, null, 2));
		}

		// Create a basic tsconfig.json if it doesn't exist
		const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
		if (!existsSync(tsconfigPath)) {
			const tsconfigContent = {
				compilerOptions: {
					lib: ["ESNext", "DOM"],
					module: "esnext",
					target: "esnext",
					moduleResolution: "bundler",
					moduleDetection: "force",
					allowImportingTsExtensions: true,
					noEmit: true,
					strict: true,
					skipLibCheck: true,
					allowSyntheticDefaultImports: true,
				},
			};
			await writeFile(tsconfigPath, JSON.stringify(tsconfigContent, null, 2));
		}

		console.log(
			"✅ Created miqro.config.ts and workflows directory with a sample.",
		);
		console.log("\n👉 Next steps:");
		console.log("  1. Run: bun install");
		console.log("  2. Run: bun run dev");
		process.exit(0);
	}

	// Load user config (defaults to miqro.config.ts in their cwd)
	const configPath = resolve(process.cwd(), "miqro.config.ts");
	let userConfig: Partial<import("./types").MiqroConfig> = {};

	try {
		const importedConfig = await import(configPath);
		userConfig = importedConfig.default || importedConfig;
	} catch (_err) {
		console.error(`❌ Could not load configuration at ${configPath}.`);
		console.error(
			`Are you sure you have a miqro.config.ts in the current directory?`,
		);
		process.exit(1);
	}

	// Verify minimal config
	if (!userConfig.workflowsDir) {
		console.error(`❌ miqro.config.ts is missing 'workflowsDir'`);
		process.exit(1);
	}

	const absoluteWorkflowsDir = resolve(process.cwd(), userConfig.workflowsDir);
	userConfig.workflowsDir = absoluteWorkflowsDir;

	if (command === "dev") {
		// Bun's native --watch must be passed to the bun executable, not the script inside.
		// If the user runs `miqro dev`, we spawn a new bun process with --watch
		console.log("🔄 Starting Miqro in DEV mode (hot-reloading enabled)...");
		Bun.spawn(["bun", "--watch", Bun.argv[1], "start"], {
			stdout: "inherit",
			stderr: "inherit",
			cwd: process.cwd(),
		});
	} else if (command === "start") {
		// Actually start the server
		console.log("🚀 Starting Miqro...");
		const app = await startMiqro(userConfig as import("./types").MiqroConfig);
		Bun.serve(app);
	} else if (command === "build") {
		// Generate a static build file for production
		console.log("📦 Building Miqro for production...");

		// 1. Read all files in the workflows dir so we can statically import them
		let files: string[] = [];
		try {
			files = await readdir(absoluteWorkflowsDir);
		} catch (_err) {
			console.error(
				`❌ Failed reading workflows directory during build: ${absoluteWorkflowsDir}`,
			);
			process.exit(1);
		}

		const workflowFiles = files.filter(
			(f) => f.endsWith(".ts") || f.endsWith(".js"),
		);

		// 2. Generate a temporary entrypoint file in the current directory
		const tempEntryPath = resolve(process.cwd(), ".miqro.entry.ts");

		let tempCode = `import { Hono } from 'hono';\n`;
		tempCode += `import { logger } from 'hono/logger';\n`;
		tempCode += `import cron from 'node-cron';\n`;
		tempCode += `import { startMiqroCore } from '${resolve(__dirname, "index.ts")}'; // From miqro module\n\n`;

		// Add static imports
		workflowFiles.forEach((file, idx) => {
			tempCode += `import wf_${idx} from '${resolve(absoluteWorkflowsDir, file)}';\n`;
		});

		tempCode += `\nconst staticWorkflowsList = [\n`;
		workflowFiles.forEach((_, idx) => {
			tempCode += `  wf_${idx},\n`;
		});
		tempCode += `];\n\n`;

		tempCode += `const app = await startMiqroCore({\n`;
		tempCode += `  port: ${userConfig.port || 3000},\n`;
		tempCode += `}, staticWorkflowsList);\n\n`;

		tempCode += `export default app;\n`; // For Bun.serve if executed naturally

		await writeFile(tempEntryPath, tempCode);

		// 3. Build using bun
		const outDir = resolve(process.cwd(), "dist");
		const outName = "index.js";
		console.log(`Compiling single file artifact to ${outDir}/${outName}...`);

		const result = await Bun.build({
			entrypoints: [tempEntryPath],
			outdir: outDir,
			target: "bun",
			naming: outName,
		});

		// Cleanup temp file
		try {
			await unlink(tempEntryPath);
		} catch (_e) {}

		if (!result.success) {
			console.error("❌ Build failed");
			console.error(result.logs);
			process.exit(1);
		} else {
			console.log(`✅ Build successful! Run it with: bun run dist/${outName}`);
		}
	} else {
		console.error(`❌ Unknown command: ${command}`);
		console.error("\nUsage: miqro <command>\n");
		console.error("Available commands:");
		console.error(
			"  init    - Scaffolds a new project with miqro.config.ts and sample workflow",
		);
		console.error("  dev     - Starts development server with hot-reloading");
		console.error("  start   - Starts server in production mode");
		console.error(
			"  build   - Compiles project into a standalone executable at ./dist/index.js\n",
		);
		console.error("Example:");
		console.error("  bunx @qnton/miqro init");
		console.error("  bunx @qnton/miqro dev");
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("Fatal exception in CLI", err);
	process.exit(1);
});
