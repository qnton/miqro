import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const CLI_PATH = resolve(import.meta.dir, "../src/cli.ts");
const TEST_DIR = resolve(import.meta.dir, "temp_cli_test");

describe("Miqro CLI", () => {
	beforeAll(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		mkdirSync(TEST_DIR);
	});

	afterAll(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("init command creates config and workflows", async () => {
		const proc = Bun.spawn(["bun", CLI_PATH, "init"], {
			cwd: TEST_DIR,
			stdout: "pipe",
			stderr: "pipe",
		});

		await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const _stderr = await new Response(proc.stderr).text();

		expect(proc.exitCode).toBe(0);
		expect(stdout).toContain("Created miqro.config.ts and workflows directory");

		expect(existsSync(resolve(TEST_DIR, "miqro.config.ts"))).toBe(true);
		expect(existsSync(resolve(TEST_DIR, "workflows/sample.ts"))).toBe(true);
		expect(existsSync(resolve(TEST_DIR, "package.json"))).toBe(true);
		expect(existsSync(resolve(TEST_DIR, "tsconfig.json"))).toBe(true);
	});

	test("init command fails if config already exists", async () => {
		// Should already exist from previous test
		const proc = Bun.spawn(["bun", CLI_PATH, "init"], {
			cwd: TEST_DIR,
			stdout: "pipe",
			stderr: "pipe",
		});

		await proc.exited;
		expect(proc.exitCode).toBe(1);

		const stderr = await new Response(proc.stderr).text();
		expect(stderr).toContain("miqro.config.ts already exists");
	});
});
