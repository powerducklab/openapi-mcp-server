import { describe, expect, it } from "vitest";
import { buildRequest } from "../src/core/request-builder.js";
import type { OperationObject, PathItemObject } from "@powerduck/openapi-parser";

const baseUrl = "https://api.example.com";

describe("request-builder", () => {
  describe("buildRequest - basic", () => {
    it("builds GET request with path parameters", () => {
      const operation: OperationObject = {
        operationId: "getUser",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/users/{id}", {} as PathItemObject, operation, { id: "123" });

      expect(result.url).toBe(`${baseUrl}/users/123`);
      expect(result.query).toBeInstanceOf(URLSearchParams);
    });

    it("builds GET request with query parameters", () => {
      const operation: OperationObject = {
        operationId: "listUsers",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/users", {} as PathItemObject, operation, { page: 2, limit: 50 });

      expect(result.url).toBe(`${baseUrl}/users`);
      expect(result.query.get("page")).toBe("2");
      expect(result.query.get("limit")).toBe("50");
    });

    it("builds POST request with JSON body", () => {
      const operation: OperationObject = {
        operationId: "createUser",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      } as OperationObject;

      const bodyData = { name: "Alice", email: "alice@example.com" };
      const result = buildRequest(baseUrl, "/users", {} as PathItemObject, operation, { body: bodyData });

      expect(result.url).toBe(`${baseUrl}/users`);
      expect(result.body).toBeDefined();
      expect(result.body).toEqual(bodyData);
    });

    it("builds DELETE request", () => {
      const operation: OperationObject = {
        operationId: "deleteUser",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "204": { description: "No Content" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/users/{id}", {} as PathItemObject, operation, { id: "123" });

      expect(result.url).toBe(`${baseUrl}/users/123`);
    });

    it("builds PUT request", () => {
      const operation: OperationObject = {
        operationId: "updateUser",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { name: { type: "string" } } },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/users/{id}", {} as PathItemObject, operation, { id: "123", body: { name: "Updated" } });

      expect(result.url).toBe(`${baseUrl}/users/123`);
    });

    it("builds PATCH request", () => {
      const operation: OperationObject = {
        operationId: "patchUser",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { name: { type: "string" } } },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/users/{id}", {} as PathItemObject, operation, { id: "123", body: { name: "Patched" } });

      expect(result.url).toBe(`${baseUrl}/users/123`);
    });
  });

  describe("buildRequest - headers", () => {
    it("includes header parameters", () => {
      const operation: OperationObject = {
        operationId: "withHeaders",
        parameters: [
          { name: "X-Request-ID", in: "header", schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/items", {} as PathItemObject, operation, { "X-Request-ID": "req-123" });

      expect(result.headers["X-Request-ID"]).toBe("req-123");
    });
  });

  describe("buildRequest - edge cases", () => {
    it("handles missing optional parameters", () => {
      const operation: OperationObject = {
        operationId: "optionalParams",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/items", {} as PathItemObject, operation, {});

      expect(result.url).toBe(`${baseUrl}/items`);
      expect(result.query.get("search")).toBeNull();
    });

    it("handles path with multiple variables", () => {
      const operation: OperationObject = {
        operationId: "multiPath",
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string" } },
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/orgs/{orgId}/users/{userId}", {} as PathItemObject, operation, { orgId: "org1", userId: "user2" });

      expect(result.url).toContain("/org1/");
      expect(result.url).toContain("/user2");
    });

    it("handles integer path parameters", () => {
      const operation: OperationObject = {
        operationId: "intPath",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/items/{id}", {} as PathItemObject, operation, { id: 42 });

      expect(result.url).toContain("/42");
    });

    it("throws for invalid base URL", () => {
      const operation: OperationObject = {
        operationId: "test",
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      expect(() => buildRequest("not-a-url", "/test", {} as PathItemObject, operation, {})).toThrow();
    });

    it("throws for unsupported protocol", () => {
      const operation: OperationObject = {
        operationId: "test",
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      expect(() => buildRequest("ftp://example.com", "/test", {} as PathItemObject, operation, {})).toThrow();
    });
  });

  describe("buildRequest - path item merge", () => {
    it("merges path-level and operation-level parameters", () => {
      const pathItem: PathItemObject = {
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string" } },
        ],
      } as PathItemObject;

      const operation: OperationObject = {
        operationId: "mergedParams",
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/orgs/{orgId}/users/{userId}", pathItem, operation, { orgId: "org1", userId: "user2" });

      expect(result.url).toContain("org1");
      expect(result.url).toContain("user2");
    });
  });

  describe("buildRequest - result structure", () => {
    it("returns result with url, query, headers, body, dropped", () => {
      const operation: OperationObject = {
        operationId: "test",
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/test", {} as PathItemObject, operation, {});

      expect(result.url).toBeDefined();
      expect(result.query).toBeInstanceOf(URLSearchParams);
      expect(result.headers).toBeDefined();
      expect(result.dropped).toBeDefined();
      expect(Array.isArray(result.dropped)).toBe(true);
    });

    it("reports dropped unknown arguments", () => {
      const operation: OperationObject = {
        operationId: "dropTest",
        responses: { "200": { description: "OK" } },
      } as OperationObject;

      const result = buildRequest(baseUrl, "/test", {} as PathItemObject, operation, { unknownParam: "value" });

      expect(result.dropped.length).toBeGreaterThan(0);
      expect(result.dropped[0]?.key).toBe("unknownParam");
    });
  });
});
