import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server, type RequestListener } from "node:http";
import { executeToolCall } from "../src/core/http-executor";

const servers: Server[] = [];
async function listen(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});
const document = (url: string): any => ({
  openapi: "3.1.0",
  info: { title: "Test", version: "1" },
  servers: [{ url }],
  paths: {
    "/test": {
      get: { operationId: "read", responses: { "200": { description: "ok" } } },
    },
  },
});
describe("operator credentials", () => {
  it("redacts configured custom API key headers without changing the outgoing request", async () => {
    let received: unknown;
    const url = await listen((req, res) => {
      received = req.headers["x-tenant-secret"];
      res.end("ok");
    });
    const logs: unknown[] = [];
    await executeToolCall(
      document(url),
      "read",
      {},
      {
        security: { apiKeys: { "X-Tenant-Secret": "private-value" } },
        onLog: (entry) => logs.push(entry),
      },
    );
    expect(received).toBe("private-value");
    expect(JSON.stringify(logs)).not.toContain("private-value");
    expect(JSON.stringify(logs)).toContain("[redacted]");
  });
  it("does not forward custom API keys across redirect origins", async () => {
    let received: unknown;
    const destination = await listen((req, res) => {
      received = req.headers["x-tenant-secret"];
      res.end("ok");
    });
    const source = await listen((_req, res) => {
      res.writeHead(302, { Location: destination + "/other" });
      res.end();
    });
    await executeToolCall(
      document(source),
      "read",
      {},
      { security: { apiKeys: { "X-Tenant-Secret": "private-value" } } },
    );
    expect(received).toBeUndefined();
  });
  it("preserves custom credentials on same-origin redirects", async () => {
    let received: unknown;
    const source = await listen((req, res) => {
      if (req.url === "/test") {
        res.writeHead(302, { Location: "/other" });
        res.end();
      } else {
        received = req.headers["x-tenant-secret"];
        res.end("ok");
      }
    });
    await executeToolCall(
      document(source),
      "read",
      {},
      { security: { apiKeys: { "X-Tenant-Secret": "private-value" } } },
    );
    expect(received).toBe("private-value");
  });
});
