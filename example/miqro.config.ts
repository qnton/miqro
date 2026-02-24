import type { MiqroConfig } from "@qnton/miqro";

const config: MiqroConfig = {
  workflowsDir: "./workflows", // The CLI resolves this relative to process.cwd()
  port: 3000,
  middleware: [
    async (c, next) => {
      const start = Date.now();
      await next();
      const end = Date.now();
      c.res.headers.set("X-Response-Time", `${end - start}ms`);
    }
  ]
};

export default config;
