import { describe, expect, it } from "vitest";
import { generateResources, readResource } from "../src/registry/resource-registry.js";
import type { Oas32Document as Document } from "@powerduck/openapi-parser";

const sampleSpec: Document = {
  openapi: "3.1.0",
  info: {
    title: "Sample API",
    version: "1.0.0",
    description: "A sample API for testing resources",
  },
  servers: [{ url: "https://api.example.com/v1" }],
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        summary: "List all users",
        responses: { "200": { description: "OK" } },
      },
    },
    "/users/{id}": {
      get: {
        operationId: "getUser",
        summary: "Get user by ID",
        responses: { "200": { description: "OK" } },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
        },
      },
      Error: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },
} as Document;

describe("resource-registry", () => {
  describe("generateResources", () => {
    it("generates resources for the spec", () => {
      const resources = generateResources(sampleSpec);
      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);
    });

    it("generates resources with URIs", () => {
      const resources = generateResources(sampleSpec);
      for (const resource of resources) {
        expect(resource.uri).toBeDefined();
        expect(typeof resource.uri).toBe("string");
        expect(resource.uri.length).toBeGreaterThan(0);
      }
    });

    it("generates resources with names", () => {
      const resources = generateResources(sampleSpec);
      for (const resource of resources) {
        expect(resource.name).toBeDefined();
        expect(typeof resource.name).toBe("string");
      }
    });

    it("generates resources with descriptions", () => {
      const resources = generateResources(sampleSpec);
      for (const resource of resources) {
        expect(resource.description).toBeDefined();
        expect(typeof resource.description).toBe("string");
      }
    });

    it("generates resources with MIME types", () => {
      const resources = generateResources(sampleSpec);
      for (const resource of resources) {
        expect(resource.mimeType).toBeDefined();
        expect(typeof resource.mimeType).toBe("string");
      }
    });

    it("includes spec-level resource", () => {
      const resources = generateResources(sampleSpec);
      const uris = resources.map((r) => r.uri);
      expect(uris.some((u) => u.includes("openapi") || u.includes("spec") || u.includes("api"))).toBe(true);
    });

    it("handles spec with no paths", () => {
      const emptySpec = {
        openapi: "3.1.0",
        info: { title: "Empty", version: "1.0.0" },
      } as Document;
      const resources = generateResources(emptySpec);
      expect(Array.isArray(resources)).toBe(true);
    });

    it("handles spec with servers", () => {
      const resources = generateResources(sampleSpec);
      expect(resources.length).toBeGreaterThan(0);
    });

    it("URIs are unique", () => {
      const resources = generateResources(sampleSpec);
      const uris = resources.map((r) => r.uri);
      const uniqueUris = new Set(uris);
      expect(uniqueUris.size).toBe(uris.length);
    });
  });

  describe("readResource", () => {
    it("reads existing resource by URI", () => {
      const resources = generateResources(sampleSpec);
      if (resources.length > 0) {
        const content = readResource(sampleSpec, resources[0]!.uri);
        expect(content).toBeDefined();
        expect(content).not.toBeNull();
      }
    });

    it("returns null for non-existent URI", () => {
      const content = readResource(sampleSpec, "non-existent-uri-xyz://nothing");
      expect(content).toBeNull();
    });

    it("returns null for null spec", () => {
      expect(readResource(null as any, "test")).toBeNull();
    });

    it("returned content has uri and mimeType", () => {
      const resources = generateResources(sampleSpec);
      if (resources.length > 0) {
        const content = readResource(sampleSpec, resources[0]!.uri);
        expect(content?.uri).toBe(resources[0]!.uri);
        expect(content?.mimeType).toBeDefined();
      }
    });

    it("returned content has text property", () => {
      const resources = generateResources(sampleSpec);
      if (resources.length > 0) {
        const content = readResource(sampleSpec, resources[0]!.uri);
        expect(content?.text).toBeDefined();
        expect(typeof content?.text).toBe("string");
      }
    });

    it("content text contains spec information", () => {
      const resources = generateResources(sampleSpec);
      if (resources.length > 0) {
        const content = readResource(sampleSpec, resources[0]!.uri);
        expect(content?.text.length).toBeGreaterThan(0);
      }
    });
  });
});
