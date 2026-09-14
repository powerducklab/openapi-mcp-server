import { describe, expect, it } from "vitest";
import {
  generateTools,
  generateToolsDetailed,
  buildBindingIndex,
  RESERVED_BODY_KEYS,
} from "../src/core/tool-generator.js";
import type { Oas32Document as Document } from "@powerduck/openapi-parser";

const simpleSpec: Document = {
  openapi: "3.1.0",
  info: { title: "Simple API", version: "1.0.0" },
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        summary: "List all users",
        description: "Returns a paginated list of users",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: { "200": { description: "OK" } },
      },
      post: {
        operationId: "createUser",
        summary: "Create a new user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email"],
                properties: {
                  name: { type: "string" },
                  email: { type: "string", format: "email" },
                  age: { type: "integer" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/users/{id}": {
      get: {
        operationId: "getUser",
        summary: "Get user by ID",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
      delete: {
        operationId: "deleteUser",
        summary: "Delete user",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "204": { description: "No Content" } },
      },
    },
  },
} as Document;

describe("tool-generator", () => {
  describe("generateTools", () => {
    it("generates tools for all operations", () => {
      const tools = generateTools(simpleSpec);
      expect(tools).toHaveLength(4);
    });

    it("generates tool with correct name from operationId", () => {
      const tools = generateTools(simpleSpec);
      const names = tools.map((t) => t.name);
      expect(names).toContain("listUsers");
      expect(names).toContain("createUser");
      expect(names).toContain("getUser");
      expect(names).toContain("deleteUser");
    });

    it("includes description from summary", () => {
      const tools = generateTools(simpleSpec);
      const listUsers = tools.find((t) => t.name === "listUsers");
      expect(listUsers?.description).toContain("List all users");
    });

    it("includes input schema with query parameters", () => {
      const tools = generateTools(simpleSpec);
      const listUsers = tools.find((t) => t.name === "listUsers");
      expect(listUsers?.inputSchema).toBeDefined();
      const props = (listUsers?.inputSchema as any)?.properties;
      expect(props.page).toBeDefined();
      expect(props.limit).toBeDefined();
    });

    it("includes input schema with path parameters", () => {
      const tools = generateTools(simpleSpec);
      const getUser = tools.find((t) => t.name === "getUser");
      const props = (getUser?.inputSchema as any)?.properties;
      expect(props.id).toBeDefined();
    });

    it("includes input schema with request body key", () => {
      const tools = generateTools(simpleSpec);
      const createUser = tools.find((t) => t.name === "createUser");
      const props = (createUser?.inputSchema as any)?.properties;
      // Body is nested under "body" or "requestBody" key
      expect(props.body || props.requestBody).toBeDefined();
    });

    it("marks required path parameters in input schema", () => {
      const tools = generateTools(simpleSpec);
      const getUser = tools.find((t) => t.name === "getUser");
      const required = (getUser?.inputSchema as any)?.required;
      expect(required).toContain("id");
    });

    it("returns empty array for null spec", () => {
      expect(generateTools(null)).toEqual([]);
    });

    it("returns empty array for undefined spec", () => {
      expect(generateTools(undefined)).toEqual([]);
    });

    it("returns empty array for spec with no paths", () => {
      const emptySpec = { openapi: "3.1.0", info: { title: "Empty", version: "1.0.0" } } as Document;
      expect(generateTools(emptySpec)).toEqual([]);
    });

    it("handles operations without operationId", () => {
      const spec = {
        openapi: "3.1.0",
        info: { title: "No ID", version: "1.0.0" },
        paths: {
          "/health": {
            get: { responses: { "200": { description: "OK" } } },
          },
        },
      } as Document;
      const tools = generateTools(spec);
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBeDefined();
    });
  });

  describe("generateToolsDetailed", () => {
    it("returns detailed result with tools and bindings", () => {
      const result = generateToolsDetailed(simpleSpec);
      expect(result.tools).toBeDefined();
      expect(result.tools).toHaveLength(4);
      expect(result.bindings).toBeDefined();
      expect(result.issues).toBeDefined();
    });

    it("includes bindings for each tool", () => {
      const result = generateToolsDetailed(simpleSpec);
      expect(result.bindings).toHaveLength(4);
      expect(result.bindings[0]?.toolName).toBeDefined();
      expect(result.bindings[0]?.path).toBeDefined();
      expect(result.bindings[0]?.method).toBeDefined();
    });

    it("bindings include operation reference", () => {
      const result = generateToolsDetailed(simpleSpec);
      const binding = result.bindings.find((b) => b.toolName === "listUsers");
      expect(binding?.operation).toBeDefined();
      expect(binding?.operation.operationId).toBe("listUsers");
    });

    it("returns empty result for null spec", () => {
      const result = generateToolsDetailed(null);
      expect(result.tools).toEqual([]);
      expect(result.bindings).toEqual([]);
    });
  });

  describe("buildBindingIndex", () => {
    it("builds index mapping tool names to bindings", () => {
      const index = buildBindingIndex(simpleSpec);
      expect(index.get("listUsers")).toBeDefined();
      expect(index.get("createUser")).toBeDefined();
      expect(index.get("getUser")).toBeDefined();
      expect(index.get("deleteUser")).toBeDefined();
    });

    it("returns empty map for null spec", () => {
      const index = buildBindingIndex(null);
      expect(index.size).toBe(0);
    });

    it("index values are ToolBinding objects", () => {
      const index = buildBindingIndex(simpleSpec);
      const binding = index.get("listUsers");
      expect(binding?.toolName).toBe("listUsers");
      expect(binding?.method).toBe("get");
      expect(binding?.path).toBe("/users");
    });
  });

  describe("RESERVED_BODY_KEYS", () => {
    it("contains body and fallback body keys", () => {
      expect(RESERVED_BODY_KEYS).toContain("body");
      expect(RESERVED_BODY_KEYS.length).toBeGreaterThanOrEqual(1);
    });

    it("is readonly array", () => {
      expect(Array.isArray(RESERVED_BODY_KEYS)).toBe(true);
    });
  });

  describe("complex spec scenarios", () => {
    it("handles header parameters", () => {
      const spec = {
        openapi: "3.1.0",
        info: { title: "Header API", version: "1.0.0" },
        paths: {
          "/items": {
            get: {
              operationId: "listItems",
              parameters: [
                { name: "X-Request-ID", in: "header", schema: { type: "string" } },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      } as Document;
      const tools = generateTools(spec);
      expect(tools).toHaveLength(1);
      const props = (tools[0]?.inputSchema as any)?.properties;
      expect(props["X-Request-ID"]).toBeDefined();
    });

    it("handles path-level parameters", () => {
      const spec = {
        openapi: "3.1.0",
        info: { title: "Path Param API", version: "1.0.0" },
        paths: {
          "/orgs/{orgId}/users": {
            parameters: [
              { name: "orgId", in: "path", required: true, schema: { type: "string" } },
            ],
            get: {
              operationId: "listOrgUsers",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      } as Document;
      const tools = generateTools(spec);
      expect(tools).toHaveLength(1);
      const props = (tools[0]?.inputSchema as any)?.properties;
      expect(props.orgId).toBeDefined();
    });

    it("handles multiple content types in request body", () => {
      const spec = {
        openapi: "3.1.0",
        info: { title: "Multi Content API", version: "1.0.0" },
        paths: {
          "/upload": {
            post: {
              operationId: "uploadFile",
              requestBody: {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { data: { type: "string" } } },
                  },
                  "multipart/form-data": {
                    schema: { type: "object", properties: { file: { type: "string", format: "binary" } } },
                  },
                },
              },
              responses: { "200": { description: "OK" } },
            },
          },
        },
      } as Document;
      const tools = generateTools(spec);
      expect(tools).toHaveLength(1);
    });

    it("handles array query parameters", () => {
      const spec = {
        openapi: "3.1.0",
        info: { title: "Array API", version: "1.0.0" },
        paths: {
          "/search": {
            get: {
              operationId: "search",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  schema: { type: "array", items: { type: "string" } },
                },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      } as Document;
      const tools = generateTools(spec);
      expect(tools).toHaveLength(1);
      const props = (tools[0]?.inputSchema as any)?.properties;
      expect(props.tags.type).toBe("array");
    });

    it("handles cookie parameters", () => {
      const spec = {
        openapi: "3.1.0",
        info: { title: "Cookie API", version: "1.0.0" },
        paths: {
          "/session": {
            get: {
              operationId: "getSession",
              parameters: [
                { name: "sessionId", in: "cookie", schema: { type: "string" } },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      } as Document;
      const tools = generateTools(spec);
      expect(tools).toHaveLength(1);
    });
  });
});
