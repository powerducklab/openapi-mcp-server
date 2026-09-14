# @powerduck/openapi-mcp-server

[![npm version](https://img.shields.io/npm/v/@powerduck/openapi-mcp-server)](https://www.npmjs.com/package/@powerduck/openapi-mcp-server)
[![license](https://img.shields.io/npm/l/@powerduck/openapi-mcp-server)](https://github.com/powerducklab/openapi-mcp-server/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/@powerduck/openapi-mcp-server)](https://www.npmjs.com/package/@powerduck/openapi-mcp-server)

Turn any OpenAPI 3.2 document into a fully functional MCP (Model Context Protocol) server. Automatically generates tools, prompts, and resources from your API spec. Supports both stdio and HTTP (SSE) transports.

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
npx @powerduck/openapi-mcp-server serve --spec ./openapi.json
```

### Run as an HTTP server (CLI)

```bash
npx @powerduck/openapi-mcp-server serve \
  --spec ./openapi.json \
  --transport http \
  --port 3000 \
  --route-prefix /mcp
```

### Programmatic stdio server

```typescript
import { startStdioServer } from "@powerduck/openapi-mcp-server";

await startStdioServer({
  specPath: "./openapi.json",
  serverName: "My API MCP Server",
  serverVersion: "1.0.0",
});
```

### Programmatic HTTP server (Express)

```typescript
import express from "express";
import { attachSseRoutes } from "@powerduck/openapi-mcp-server";

const app = express();

attachSseRoutes(app, {
  specPath: "./openapi.json",
  routePrefix: "/mcp",
  serverName: "My API MCP Server",
});

app.listen(3000, () => {
  console.log("MCP server running at http://localhost:3000/mcp");
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
openapi-mcp-server serve [options]

# Stdio server (default)
openapi-mcp-server serve --spec ./openapi.json

# HTTP/SSE server
openapi-mcp-server serve --spec ./openapi.json --transport http --port 3000

# With auth and filtering
openapi-mcp-server serve \
  --spec ./openapi.json \
  --transport http \
  --port 3000 \
  --bearer $TOKEN \
  --include-tags users,orders \
  --exclude-methods delete
```

### Options

| Option              | Type       | Default   | Description                                |
| ------------------- | ---------- | --------- | ------------------------------------------ |
| `--spec`            | `string`   | -         | Path or URL to OpenAPI spec (required)     |
| `--transport`       | `string`   | `stdio`   | Transport type: `stdio` or `http`          |
| `--port`            | `number`   | `3000`    | HTTP server port                           |
| `--host`            | `string`   | `0.0.0.0` | HTTP server host                           |
| `--route-prefix`    | `string`   | `/mcp`    | HTTP route prefix                          |
| `--server-name`     | `string`   | -         | MCP server display name                    |
| `--server-version`  | `string`   | `1.0.0`   | MCP server version                         |
| `--bearer`          | `string`   | -         | Bearer token for API authentication        |
| `--api-key`         | `string`   | -         | API key for API authentication             |
| `--header`          | `string[]` | -         | Custom headers (Key: Value)                |
| `--include-tags`    | `string`   | -         | Include tools with these tags              |
| `--exclude-tags`    | `string`   | -         | Exclude tools with these tags              |
| `--include-methods` | `string`   | -         | Include tools with these methods           |
| `--exclude-methods` | `string`   | -         | Exclude tools with these methods           |
| `--include-paths`   | `string`   | -         | Include tools matching these path patterns |
| `--exclude-paths`   | `string`   | -         | Exclude tools matching these path patterns |
| `--admin`           | `boolean`  | `true`    | Enable admin dashboard                     |
| `--admin-port`      | `number`   | `3001`    | Admin dashboard port                       |
| `--log-level`       | `string`   | `info`    | Log level: debug, info, warn, error        |
| `--cors-origin`     | `string`   | `*`       | CORS allowed origin                        |
| `--rate-limit`      | `number`   | `100`     | Max requests per minute per tool           |

---

## Programmatic API

### `startStdioServer(options)`

Start an MCP server over stdio.

```typescript
import { startStdioServer } from "@powerduck/openapi-mcp-server";

await startStdioServer({
  specPath: "./openapi.json",
  serverName: "My API",
  serverVersion: "1.0.0",
  securityValues: { bearerAuth: "token" },
  toolFilter: { includeTags: ["users", "orders"] },
  logLevel: "info",
});
```

### `attachSseRoutes(app, options)`

Attach MCP SSE routes to an Express app.

```typescript
import express from "express";
import { attachSseRoutes } from "@powerduck/openapi-mcp-server";

const app = express();

attachSseRoutes(app, {
  specPath: "./openapi.json",
  routePrefix: "/mcp",
  serverName: "My API",
  corsOrigin: "https://my-app.com",
});

app.listen(3000);
```

### `startAdminServer(options)`

Start the admin dashboard server.

```typescript
import { startAdminServer } from "@powerduck/openapi-mcp-server";

await startAdminServer({
  port: 3001,
  mcpServerUrl: "http://localhost:3000/mcp",
});
```

### `createMcpServer(options)`

Create a low-level MCP server instance for custom integration.

```typescript
import { createMcpServer } from "@powerduck/openapi-mcp-server";

const server = createMcpServer({
  spec: openApiDocument,
  serverName: "My API",
  securityValues: { bearerAuth: "token" },
});

// List tools
const tools = await server.listTools();

// Call a tool
const result = await server.callTool("getUser", { id: "123" });
```

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
  StdioServerOptions,
  HttpServerOptions,
  McpServerOptions,
  ToolFilter,
  SecurityValues,
  McpTool,
  McpPrompt,
  McpResource,
  ToolCallResult,
} from "@powerduck/openapi-mcp-server";
```

---

## License

MIT © [POWERDUCK LIMITED](https://www.powerduck.com)
