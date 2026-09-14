import { describe, expect, it } from "vitest";
import { generatePrompts, hasPrompt, resolvePrompt } from "../src/registry/prompt-registry.js";
import type { Oas32Document as Document } from "@powerduck/openapi-parser";

const sampleSpec: Document = {
  openapi: "3.1.0",
  info: {
    title: "Sample API",
    version: "1.0.0",
    description: "A sample API for testing",
  },
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        summary: "List all users",
        description: "Returns a paginated list of users",
        responses: { "200": { description: "OK" } },
      },
      post: {
        operationId: "createUser",
        summary: "Create a new user",
        responses: { "201": { description: "Created" } },
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
} as Document;

describe("prompt-registry", () => {
  describe("generatePrompts", () => {
    it("generates prompts for the spec", () => {
      const prompts = generatePrompts(sampleSpec);
      expect(Array.isArray(prompts)).toBe(true);
      expect(prompts.length).toBeGreaterThan(0);
    });

    it("generates prompts with names", () => {
      const prompts = generatePrompts(sampleSpec);
      for (const prompt of prompts) {
        expect(prompt.name).toBeDefined();
        expect(typeof prompt.name).toBe("string");
        expect(prompt.name.length).toBeGreaterThan(0);
      }
    });

    it("generates prompts with descriptions", () => {
      const prompts = generatePrompts(sampleSpec);
      for (const prompt of prompts) {
        expect(prompt.description).toBeDefined();
        expect(typeof prompt.description).toBe("string");
      }
    });

    it("includes spec overview prompt", () => {
      const prompts = generatePrompts(sampleSpec);
      const names = prompts.map((p) => p.name);
      expect(names).toContain("spec_overview");
    });

    it("handles spec with no paths", () => {
      const emptySpec = {
        openapi: "3.1.0",
        info: { title: "Empty", version: "1.0.0" },
      } as Document;
      const prompts = generatePrompts(emptySpec);
      expect(Array.isArray(prompts)).toBe(true);
    });

    it("handles spec with tags", () => {
      const taggedSpec = {
        openapi: "3.1.0",
        info: { title: "Tagged", version: "1.0.0" },
        tags: [
          { name: "users", description: "User operations" },
          { name: "admin", description: "Admin operations" },
        ],
        paths: {
          "/users": {
            get: { operationId: "listUsers", tags: ["users"], responses: { "200": { description: "OK" } } },
          },
        },
      } as Document;
      const prompts = generatePrompts(taggedSpec);
      expect(prompts.length).toBeGreaterThan(0);
    });
  });

  describe("hasPrompt", () => {
    it("returns true for existing prompt", () => {
      const prompts = generatePrompts(sampleSpec);
      if (prompts.length > 0) {
        expect(hasPrompt(sampleSpec, prompts[0]!.name)).toBe(true);
      }
    });

    it("returns false for non-existent prompt", () => {
      expect(hasPrompt(sampleSpec, "non-existent-prompt-name-xyz")).toBe(false);
    });
  });

  describe("resolvePrompt", () => {
    it("resolves existing prompt by name", () => {
      const prompts = generatePrompts(sampleSpec);
      if (prompts.length > 0) {
        const resolved = resolvePrompt(sampleSpec, prompts[0]!.name);
        expect(resolved).toBeDefined();
        expect(resolved?.description).toBeDefined();
        expect(resolved?.messages).toBeDefined();
        expect(Array.isArray(resolved?.messages)).toBe(true);
      }
    });

    it("returns null for non-existent prompt", () => {
      const resolved = resolvePrompt(sampleSpec, "non-existent-prompt-xyz");
      expect(resolved).toBeNull();
    });

    it("returns null for empty prompt name", () => {
      expect(resolvePrompt(sampleSpec, "")).toBeNull();
    });

    it("resolved prompt has messages", () => {
      const prompts = generatePrompts(sampleSpec);
      if (prompts.length > 0) {
        const resolved = resolvePrompt(sampleSpec, prompts[0]!.name);
        expect(resolved?.messages).toBeDefined();
        expect(Array.isArray(resolved?.messages)).toBe(true);
      }
    });
  });
});
