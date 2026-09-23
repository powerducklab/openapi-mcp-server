import { describe, expect, it } from "vitest";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createStreamableSessionHost,
  type StreamableSessionHost,
} from "../src/mcp/session-host.js";
import type { Oas32Document as Document } from "@powerduck/openapi-parser";

const spec: Document = {
  openapi: "3.1.0",
  info: { title: "Simple API", version: "1.0.0" },
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        responses: { "200": { description: "OK" } },
      },
      post: {
        operationId: "createUser",
        responses: { "201": { description: "Created" } },
      },
    },
    "/users/{id}": {
      get: {
        operationId: "getUser",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  },
} as Document;

interface Harness {
  server: Server;
  host: StreamableSessionHost;
  url: string;
}

async function startHarness(): Promise<Harness> {
  const host = createStreamableSessionHost({
    specProvider: () => spec,
    server: { name: "Test MCP", version: "1.0.0" },
    sessionIdleMs: 0,
  });

  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", async () => {
      let body: unknown;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      try {
        await host.handle(request, response, body);
      } catch (error) {
        if (!response.headersSent) {
          response.statusCode = 500;
          response.end(String(error));
        }
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address() as AddressInfo;
  return { server, host, url: `http://127.0.0.1:${port}/mcp` };
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("event-stream")) {
    const line = text
      .split("\n")
      .find((entry) => entry.startsWith("data: "));
    return JSON.parse(line!.slice(6));
  }
  return JSON.parse(text);
}

const JSON_RPC_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

describe("streamable session host", () => {
  it("opens a stateful session, lists tools, streams GET, and closes on DELETE", async () => {
    const harness = await startHarness();
    try {
      // initialize without a session returns a session id.
      const initialize = await fetch(harness.url, {
        method: "POST",
        headers: JSON_RPC_HEADERS,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      });
      expect(initialize.status).toBe(200);
      const sessionId = initialize.headers.get("mcp-session-id");
      expect(sessionId).toBeTruthy();
      const initPayload = await readJson(initialize);
      expect(initPayload.result.serverInfo.name).toBe("Test MCP");
      expect(harness.host.activeSessionCount()).toBe(1);

      // notifications/initialized is accepted.
      const notified = await fetch(harness.url, {
        method: "POST",
        headers: {
          ...JSON_RPC_HEADERS,
          "mcp-session-id": sessionId!,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      });
      expect(notified.status).toBe(202);
      notified.body?.cancel();

      // tools/list over the session returns the generated tools.
      const listed = await fetch(harness.url, {
        method: "POST",
        headers: { ...JSON_RPC_HEADERS, "mcp-session-id": sessionId! },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      });
      expect(listed.status).toBe(200);
      const listPayload = await readJson(listed);
      expect(listPayload.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual(
        ["createUser", "getUser", "listUsers"],
      );

      // GET over the session opens the server-sent stream.
      const stream = await fetch(harness.url, {
        method: "GET",
        headers: { accept: "text/event-stream", "mcp-session-id": sessionId! },
      });
      expect(stream.status).toBe(200);
      expect(stream.headers.get("content-type")?.includes("event-stream")).toBe(true);
      await stream.body!.cancel();

      // A non-initialize request without a session is rejected.
      const noSession = await fetch(harness.url, {
        method: "POST",
        headers: JSON_RPC_HEADERS,
        body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
      });
      expect(noSession.status).toBe(400);
      noSession.body?.cancel();

      // An unknown session id is a 404.
      const unknown = await fetch(harness.url, {
        method: "POST",
        headers: { ...JSON_RPC_HEADERS, "mcp-session-id": "does-not-exist" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} }),
      });
      expect(unknown.status).toBe(404);
      unknown.body?.cancel();

      // DELETE closes the session; later requests no longer resolve it.
      const closed = await fetch(harness.url, {
        method: "DELETE",
        headers: { "mcp-session-id": sessionId! },
      });
      expect([200, 202]).toContain(closed.status);
      closed.body?.cancel();
      expect(harness.host.activeSessionCount()).toBe(0);
    } finally {
      await harness.host.dispose();
      await new Promise<void>((resolve) => harness.server.close(() => resolve()));
    }
  });

  it("rejects sessions when no specification is available", async () => {
    const host = createStreamableSessionHost({
      specProvider: () => null,
      sessionIdleMs: 0,
    });
    const server = http.createServer((request, response) => {
      let raw = "";
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("end", () => host.handle(request, response, raw ? JSON.parse(raw) : undefined));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: JSON_RPC_HEADERS,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      });
      expect(response.status).toBe(503);
      response.body?.cancel();
    } finally {
      await host.dispose();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
