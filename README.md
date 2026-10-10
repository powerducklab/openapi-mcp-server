# @powerduck/openapi-mcp-server

[![npm version](https://img.shields.io/npm/v/@powerduck/openapi-mcp-server)](https://www.npmjs.com/package/@powerduck/openapi-mcp-server)
[![license](https://img.shields.io/npm/l/@powerduck/openapi-mcp-server)](https://github.com/powerducklab/openapi-mcp-server/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/@powerduck/openapi-mcp-server)](https://www.npmjs.com/package/@powerduck/openapi-mcp-server)

Turn any OpenAPI 3.2 document into a fully functional MCP (Model Context Protocol) server. Automatically generates tools, prompts, and resources from your API spec. Supports stdio and Streamable HTTP transports, plus a built-in web UI and admin API.

---

Powerduck is an open-source developer tooling platform for teams building modern API workflows.

- **Auto-Generated Tools** — Every OpenAPI operation becomes an MCP tool with full parameter schemas
- **Auto-Generated Prompts** — Smart prompt templates for common API workflows
- **Auto-Generated Resources** — API docs, schemas, and examples accessible as MCP resources
- **2 Transports** — stdio for local AI clients, HTTP/SSE for remote and cloud deployments
- **Security Resolution** — Bearer tokens, API keys, Basic auth, OAuth2, and custom schemes
- **Type-Safe Execution** — Full parameter validation before executing API calls
- **Error Handling** — Structured MCP errors with API response details
- **Admin Dashboard** — Built-in web UI for monitoring tools, viewing logs, and testing
- **Express Integration** — Attach MCP routes to any Express/Node.js HTTP server
- **CLI & Programmatic** — Full CLI for quick starts, programmatic API for custom setups

---

## Quick Start

### Install

```bash
npm install @powerduck/openapi-mcp-server
```

### Run as a stdio server (CLI)

```bash
npx @powerduck/openapi-mcp-server serve --transport stdio --spec ./openapi.json
```

### Run the web server (CLI)

`web` is the default transport. It serves the Streamable HTTP endpoint at `/mcp`, the web UI, and the admin API.

```bash
npx @powerduck/openapi-mcp-server serve \
  --spec ./openapi.json \
  --port 3000
```

### Programmatic stdio server

`startStdioServer` takes a loaded document, not an options object. Use `loadOpenApiSpec` to read and parse a file first.

```typescript
import { loadOpenApiSpec, startStdioServer } from "@powerduck/openapi-mcp-server";

const spec = await loadOpenApiSpec("./openapi.json");
await startStdioServer(spec);
```

### Programmatic HTTP server (Express)

`attachSseRoutes` wires the Streamable HTTP (and legacy SSE) endpoints into an existing Express app. It takes provider functions that return the current document and execution context.

```typescript
import express from "express";
import { attachSseRoutes } from "@powerduck/openapi-mcp-server";

const app = express();
const spec = openApiDocument; // a loaded OpenAPI 3.2 document

attachSseRoutes(
  app,
  () => spec,
  () => ({}),
);

app.listen(3000, () => {
  console.log("MCP endpoint at http://localhost:3000/mcp");
});
```

---

## Links

- [Official Website](https://www.powerduck.com/opensource/openapi-mcp-server.html)
- [Documentation](https://www.powerduck.com/docs/openapi-mcp-server/introduction)
- [GitHub](https://github.com/powerducklab/openapi-mcp-server)
- [npm](https://www.npmjs.com/package/@powerduck/openapi-mcp-server)

---

## Features

- **Auto-generated tools** — Every OpenAPI operation becomes an MCP tool with full parameter schemas
- **Auto-generated prompts** — Smart prompt templates for common API workflows
- **Auto-generated resources** — API docs, schemas, and examples accessible as MCP resources
- **2 transports** — stdio for local AI clients, HTTP/SSE for remote and cloud deployments
- **Security resolution** — Bearer tokens, API keys, Basic auth, OAuth2, and custom schemes
- **Type-safe execution** — Full parameter validation before executing API calls
- **Error handling** — Structured MCP errors with API response details
- **Admin dashboard** — Built-in web UI for monitoring tools, viewing logs, and testing
- **Express integration** — Attach MCP routes to any Express/Node.js HTTP server
- **CLI & programmatic** — Full CLI for quick starts, programmatic API for custom setups
- **Tool filtering** — Include/exclude tools by tag, path, method, or operationId
- **Custom tool wrappers** — Wrap auto-generated tools with custom logic or validation
- **Rate limiting** — Configurable rate limits per tool and per client
- **Request logging** — Structured logging for all MCP requests and API calls
- **CORS support** — Configurable CORS for HTTP transport
- **Dual ESM/CJS** — Works with `import` and `require`, with bundled TypeScript declarations

---

## CLI Reference

### Commands

```bash
openapi-mcp serve [options]

# Web server (default): Streamable HTTP at /mcp plus the web UI
openapi-mcp serve --spec ./openapi.json --port 3000

# Stdio server
openapi-mcp serve --transport stdio --spec ./openapi.json

# Web server with an admin key and an upstream override
openapi-mcp serve \
  --spec ./openapi.json \
  --port 3000 \
  --api-key $ADMIN_KEY \
  --base-url https://api.example.com
```

### Options

| Option              | Type       | Default     | Description                                            |
| ------------------- | ---------- | ----------- | ------------------------------------------------------ |
| `--spec`            | `string`   | -           | OpenAPI document file path (required in stdio mode)    |
| `--transport`       | `string`   | `web`       | Transport: `web` or `stdio`                            |
| `--port`            | `number`   | `3000`      | Web server port                                        |
| `--host`            | `string`   | `127.0.0.1` | Web server host                                        |
| `--base-url`        | `string`   | -           | Override the upstream base URL                         |
| `--api-key`         | `string`   | -           | Admin API key (also gates the HTTP transport when set) |
| `--upstream-header` | `string[]` | -           | Repeatable upstream header, `"Header-Name: value"`     |
| `--timeout`         | `number`   | `30000`     | Upstream timeout in ms                                 |
| `--no-persist`      | `flag`     | off         | Disable state persistence                              |

---

## Programmatic API

### `startStdioServer(spec, context?, options?)`

Start an MCP server over stdio.

```typescript
import { startStdioServer } from "@powerduck/openapi-mcp-server";

await startStdioServer(spec, {
  baseUrlOverride: "https://api.example.com",
});
```

- `spec` — loaded OpenAPI 3.2 document
- `context` — optional `ExecutionContext` (base URL override, upstream headers, timeout, credentials)
- `options` — optional `StartStdioServerOptions` (`handleSignals`, defaults to `true`)

### `attachSseRoutes(app, specProvider, contextProvider, routeGuard?)`

Attach the Streamable HTTP and legacy SSE routes to an Express app.

```typescript
import express from "express";
import { attachSseRoutes } from "@powerduck/openapi-mcp-server";

const app = express();

attachSseRoutes(
  app,
  () => spec,
  () => executionContext,
);

app.listen(3000);
```

- `specProvider` — `() => Document | null`
- `contextProvider` — `() => ExecutionContext`
- `routeGuard` — optional Express middleware that gates the endpoints (use `createAuthMiddleware(apiKey)`)

### `startAdminServer(config)`

Start the standalone web server: Streamable HTTP endpoint, web UI, and admin API.

```typescript
import { startAdminServer } from "@powerduck/openapi-mcp-server";

await startAdminServer({
  port: 3000,
  host: "127.0.0.1",
  specPath: "./openapi.json",
  apiKey: process.env.ADMIN_KEY,
});
```

`config` is a `ServerConfig`. Key fields: `port`, `host`, `apiKey`, `specPath`, `baseUrlOverride`, `upstreamHeaders`, `requestTimeoutMs`, `persistState`, `allowedOrigins`, and `security`.

### `buildMcpServer(specProvider, contextProvider?, options?)`

Create a low-level MCP server instance for custom integrations.

```typescript
import { buildMcpServer } from "@powerduck/openapi-mcp-server";

const server = buildMcpServer(
  () => spec,
  () => ({}),
  { name: "My API", version: "1.0.0" },
);
```

`options` is `BuildMcpServerOptions`: `name`, `version`, `pageSize`, `instructions`, and `protocol`.

---

## MCP Client Configuration

### Claude Desktop (stdio)

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": [
        "@powerduck/openapi-mcp-server",
        "serve",
        "--transport",
        "stdio",
        "--spec",
        "./openapi.json"
      ],
      "env": {
        "BEARER_TOKEN": "your-token"
      }
    }
  }
}
```

### Cursor / VS Code (HTTP)

```json
{
  "mcpServers": {
    "my-api": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

## TypeScript Types

```typescript
import type {
  StartStdioServerOptions,
  BuildMcpServerOptions,
  ServerConfig,
  ExecutionContext,
  SpecProvider,
  ContextProvider,
} from "@powerduck/openapi-mcp-server";
```

---

## Links

- [Official Website](https://www.powerduck.com/opensource/openapi-mcp-server.html)
- [Documentation](https://www.powerduck.com/docs/openapi-mcp-server/introduction/)
- [Live Demo](https://www.powerduck.com/demo/)
- [GitHub](https://github.com/powerducklab/openapi-mcp-server)
- [npm](https://www.npmjs.com/package/@powerduck/openapi-mcp-server)

## License

MIT © [POWERDUCK LIMITED](https://www.powerduck.com)

### Extended HTTP methods

HTTP operation discovery includes all nine fixed OpenAPI 3.2 methods (including `trace` and `query`) and custom verbs in `additionalOperations`, such as `PROPFIND`, `REPORT`, and `CUSTOM-VERB`. Shared method helpers come from `@powerduck/openapi-parser/methods`; path metadata is not interpreted as an operation. Custom verbs must be valid HTTP tokens. Use OpenAPI 3.2 when declaring QUERY or `additionalOperations`.
