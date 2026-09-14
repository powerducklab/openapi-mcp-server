import { describe, expect, it } from "vitest";
import {
  isPlainObject,
  isReference,
  truncateGeneratedName,
  extractPathTemplateVariables,
  iterateOperations,
  synthesizeOperationId,
  ensureUniqueName,
  findOperationById,
  findDuplicateOperationIds,
  assertUniqueOperationIds,
  collectOperationParameters,
  effectiveStyle,
  effectiveExplode,
} from "../src/core/spec-utils.js";
import type { Oas32Document as Document } from "@powerduck/openapi-parser";

const sampleDoc: Document = {
  openapi: "3.2.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/users": {
      get: { operationId: "listUsers", summary: "List users", responses: { "200": { description: "OK" } } },
      post: { operationId: "createUser", summary: "Create user", responses: { "201": { description: "Created" } } },
    },
    "/users/{id}": {
      get: { operationId: "getUser", summary: "Get user", responses: { "200": { description: "OK" } } },
      delete: { operationId: "deleteUser", summary: "Delete user", responses: { "204": { description: "No Content" } } },
    },
  },
} as Document;

describe("spec-utils", () => {
  describe("isPlainObject", () => {
    it("returns true for plain object", () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
    });

    it("returns false for null", () => {
      expect(isPlainObject(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isPlainObject(undefined)).toBe(false);
    });

    it("returns false for array", () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
    });

    it("returns false for string", () => {
      expect(isPlainObject("hello")).toBe(false);
    });

    it("returns false for number", () => {
      expect(isPlainObject(42)).toBe(false);
    });

    it("returns false for boolean", () => {
      expect(isPlainObject(true)).toBe(false);
    });

    it("returns false for function", () => {
      expect(isPlainObject(() => {})).toBe(false);
    });
  });

  describe("isReference", () => {
    it("returns true for $ref object", () => {
      expect(isReference({ $ref: "#/components/schemas/User" })).toBe(true);
    });

    it("returns false for object without $ref", () => {
      expect(isReference({ type: "object" })).toBe(false);
    });

    it("returns false for null", () => {
      expect(isReference(null)).toBe(false);
    });

    it("returns false for non-string $ref", () => {
      expect(isReference({ $ref: 123 })).toBe(false);
    });
  });

  describe("truncateGeneratedName", () => {
    it("returns name unchanged if within limit", () => {
      expect(truncateGeneratedName("short", 50)).toBe("short");
    });

    it("truncates long names with hash suffix", () => {
      const longName = "a".repeat(100);
      const result = truncateGeneratedName(longName, 30);
      expect(result.length).toBeLessThanOrEqual(30);
      expect(result).toContain("_");
    });

    it("uses default limit when not specified", () => {
      const longName = "a".repeat(100);
      const result = truncateGeneratedName(longName);
      expect(result.length).toBeLessThanOrEqual(64);
    });

    it("preserves uniqueness for different long names", () => {
      const name1 = "a".repeat(100);
      const name2 = "b".repeat(100);
      expect(truncateGeneratedName(name1, 20)).not.toBe(truncateGeneratedName(name2, 20));
    });
  });

  describe("extractPathTemplateVariables", () => {
    it("extracts single variable", () => {
      expect(extractPathTemplateVariables("/users/{id}")).toEqual(["id"]);
    });

    it("extracts multiple variables", () => {
      expect(extractPathTemplateVariables("/users/{userId}/posts/{postId}")).toEqual(["userId", "postId"]);
    });

    it("returns empty array for path without variables", () => {
      expect(extractPathTemplateVariables("/users")).toEqual([]);
    });

    it("collapses duplicate variables", () => {
      expect(extractPathTemplateVariables("/users/{id}/posts/{id}")).toEqual(["id"]);
    });

    it("handles empty string", () => {
      expect(extractPathTemplateVariables("")).toEqual([]);
    });

    it("trims variable names", () => {
      expect(extractPathTemplateVariables("/users/{ id }")).toEqual(["id"]);
    });
  });

  describe("iterateOperations", () => {
    it("yields all operations", () => {
      const operations = [...iterateOperations(sampleDoc)];
      expect(operations).toHaveLength(4);
    });

    it("includes method and path for each operation", () => {
      const operations = [...iterateOperations(sampleDoc)];
      const methods = operations.map((op) => op.method).sort();
      expect(methods).toEqual(["delete", "get", "get", "post"]);
    });

    it("includes operationId when present", () => {
      const operations = [...iterateOperations(sampleDoc)];
      const ids = operations.map((op) => op.operation?.operationId).filter(Boolean);
      expect(ids).toContain("listUsers");
      expect(ids).toContain("createUser");
    });

    it("handles document with no paths", () => {
      const emptyDoc = { openapi: "3.2.0", info: { title: "Empty", version: "1.0.0" } } as Document;
      expect([...iterateOperations(emptyDoc)]).toEqual([]);
    });
  });

  describe("synthesizeOperationId", () => {
    it("generates from method and path", () => {
      const result = synthesizeOperationId("get", "/users");
      expect(result).toBe("get_users");
    });

    it("handles path with template variables", () => {
      const result = synthesizeOperationId("get", "/users/{id}");
      expect(result).toBe("get_users_by_id");
    });

    it("handles nested paths", () => {
      const result = synthesizeOperationId("post", "/users/{userId}/posts/{postId}");
      expect(result).toBe("post_users_by_userId_posts_by_postId");
    });

    it("handles root path", () => {
      const result = synthesizeOperationId("get", "/");
      expect(result).toBe("get");
    });

    it("lowercases method", () => {
      const result = synthesizeOperationId("GET", "/users");
      expect(result).toBe("get_users");
    });

    it("generates unique ids for different paths", () => {
      const id1 = synthesizeOperationId("get", "/users");
      const id2 = synthesizeOperationId("get", "/posts");
      expect(id1).not.toBe(id2);
    });
  });

  describe("ensureUniqueName", () => {
    it("returns name unchanged when not in set", () => {
      expect(ensureUniqueName("newName", new Set())).toBe("newName");
    });

    it("appends suffix when name already exists", () => {
      const taken = new Set(["existing"]);
      const result = ensureUniqueName("existing", taken);
      expect(result).not.toBe("existing");
      expect(result).toContain("existing");
    });

    it("handles multiple collisions", () => {
      const taken = new Set(["name", "name_2", "name_3"]);
      const result = ensureUniqueName("name", taken);
      expect(result).not.toBe("name");
      expect(result).not.toBe("name_2");
      expect(result).not.toBe("name_3");
      // ensureUniqueName adds the result to the taken set
      expect(taken.has(result)).toBe(true);
    });
  });

  describe("findOperationById", () => {
    it("finds operation by id", () => {
      const result = findOperationById(sampleDoc, "getUser");
      expect(result).toBeDefined();
      expect(result?.method).toBe("get");
      expect(result?.path).toBe("/users/{id}");
    });

    it("returns null for non-existent id", () => {
      expect(findOperationById(sampleDoc, "nonExistent")).toBeNull();
    });
  });

  describe("findDuplicateOperationIds", () => {
    it("returns empty array for unique ids", () => {
      expect(findDuplicateOperationIds(sampleDoc)).toEqual([]);
    });

    it("detects duplicate operationIds", () => {
      const dupDoc = {
        openapi: "3.2.0",
        info: { title: "Dup", version: "1.0.0" },
        paths: {
          "/a": { get: { operationId: "dup", responses: { "200": { description: "OK" } } } },
          "/b": { post: { operationId: "dup", responses: { "200": { description: "OK" } } } },
        },
      } as Document;
      const duplicates = findDuplicateOperationIds(dupDoc);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]?.operationId).toBe("dup");
    });
  });

  describe("assertUniqueOperationIds", () => {
    it("does not throw for unique ids", () => {
      expect(() => assertUniqueOperationIds(sampleDoc)).not.toThrow();
    });

    it("throws for duplicate ids", () => {
      const dupDoc = {
        openapi: "3.2.0",
        info: { title: "Dup", version: "1.0.0" },
        paths: {
          "/a": { get: { operationId: "dup", responses: { "200": { description: "OK" } } } },
          "/b": { post: { operationId: "dup", responses: { "200": { description: "OK" } } } },
        },
      } as Document;
      expect(() => assertUniqueOperationIds(dupDoc)).toThrow();
    });
  });

  describe("collectOperationParameters", () => {
    it("returns empty array for operation without parameters", () => {
      const op = { responses: { "200": { description: "OK" } } };
      const result = collectOperationParameters(op as any, {} as any);
      expect(result).toEqual([]);
    });

    it("collects parameters from operation", () => {
      const op = {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      };
      const result = collectOperationParameters(op as any, {} as any);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("id");
    });

    it("merges path-level and operation-level parameters", () => {
      const pathItem = {
        parameters: [{ name: "apiKey", in: "header", required: true, schema: { type: "string" } }],
      };
      const op = {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      };
      const result = collectOperationParameters(op as any, pathItem as any);
      expect(result).toHaveLength(2);
    });
  });

  describe("effectiveStyle", () => {
    it("returns default style for query parameters", () => {
      const param = { name: "q", in: "query", schema: { type: "string" } };
      expect(effectiveStyle(param as any)).toBe("form");
    });

    it("returns explicit style when provided", () => {
      const param = { name: "q", in: "query", style: "spaceDelimited", schema: { type: "array" } };
      expect(effectiveStyle(param as any)).toBe("spaceDelimited");
    });
  });

  describe("effectiveExplode", () => {
    it("returns default explode for query parameters (form style defaults to true)", () => {
      const param = { name: "q", in: "query", schema: { type: "array" } };
      expect(effectiveExplode(param as any)).toBe(true);
    });

    it("returns explicit explode when provided", () => {
      const param = { name: "q", in: "query", explode: true, schema: { type: "array" } };
      expect(effectiveExplode(param as any)).toBe(true);
    });
  });
});
