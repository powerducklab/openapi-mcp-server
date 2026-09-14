import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSpecContent, loadOpenApiSpec } from "../src/core/openapi-loader.js";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-loader-test-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const validSpec = {
  openapi: "3.1.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        responses: { "200": { description: "OK" } },
      },
    },
  },
};

describe("openapi-loader", () => {
  describe("parseSpecContent", () => {
    it("parses valid JSON content", async () => {
      const result = await parseSpecContent(JSON.stringify(validSpec), false);
      expect(result.openapi).toBe("3.1.0");
      expect(result.info.title).toBe("Test API");
      expect(result.paths["/users"]).toBeDefined();
    });

    it("parses valid YAML content", async () => {
      const yaml = `openapi: "3.1.0"
info:
  title: YAML Test
  version: "1.0.0"
paths:
  /health:
    get:
      operationId: healthCheck
      responses:
        "200":
          description: OK
`;
      const result = await parseSpecContent(yaml, true);
      expect(result.openapi).toBe("3.1.0");
      expect(result.info.title).toBe("YAML Test");
      expect(result.paths["/health"]).toBeDefined();
    });

    it("throws for empty content", async () => {
      await expect(parseSpecContent("", false)).rejects.toThrow("empty");
    });

    it("throws for whitespace-only content", async () => {
      await expect(parseSpecContent("   ", false)).rejects.toThrow("empty");
    });

    it("throws for invalid JSON", async () => {
      await expect(parseSpecContent("{invalid json", false)).rejects.toThrow("Failed to parse JSON");
    });

    it("throws for invalid YAML", async () => {
      await expect(parseSpecContent("invalid: yaml: [", true)).rejects.toThrow("Failed to parse YAML");
    });

    it("throws for document without openapi field", async () => {
      const doc = { info: { title: "No version", version: "1.0.0" }, paths: {} };
      await expect(parseSpecContent(JSON.stringify(doc), false)).rejects.toThrow("openapi");
    });

    it("throws for document without info object", async () => {
      const doc = { openapi: "3.1.0", paths: {} };
      await expect(parseSpecContent(JSON.stringify(doc), false)).rejects.toThrow("info");
    });

    it("throws for document without title", async () => {
      const doc = { openapi: "3.1.0", info: { version: "1.0.0" }, paths: {} };
      await expect(parseSpecContent(JSON.stringify(doc), false)).rejects.toThrow("info.title");
    });

    it("throws for document without version", async () => {
      const doc = { openapi: "3.1.0", info: { title: "Test" }, paths: {} };
      await expect(parseSpecContent(JSON.stringify(doc), false)).rejects.toThrow("info.version");
    });

    it("throws for document without paths", async () => {
      const doc = { openapi: "3.1.0", info: { title: "Test", version: "1.0.0" } };
      await expect(parseSpecContent(JSON.stringify(doc), false)).rejects.toThrow("paths");
    });

    it("throws for document with empty paths", async () => {
      const doc = { openapi: "3.1.0", info: { title: "Test", version: "1.0.0" }, paths: {} };
      await expect(parseSpecContent(JSON.stringify(doc), false)).rejects.toThrow("paths");
    });

    it("dereferences internal $ref", async () => {
      const doc = {
        openapi: "3.1.0",
        info: { title: "Ref Test", version: "1.0.0" },
        paths: {
          "/users": {
            get: {
              operationId: "listUsers",
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "integer" },
                name: { type: "string" },
              },
            },
          },
        },
      };
      const result = await parseSpecContent(JSON.stringify(doc), false);
      const schema = result.paths["/users"].get.responses["200"].content["application/json"].schema;
      expect(schema.type).toBe("object");
      expect(schema.properties.id.type).toBe("integer");
    });

    it("throws for duplicate operationIds", async () => {
      const doc = {
        openapi: "3.1.0",
        info: { title: "Dup Test", version: "1.0.0" },
        paths: {
          "/a": {
            get: { operationId: "dup", responses: { "200": { description: "OK" } } },
          },
          "/b": {
            post: { operationId: "dup", responses: { "200": { description: "OK" } } },
          },
        },
      };
      await expect(parseSpecContent(JSON.stringify(doc), false)).rejects.toThrow();
    });
  });

  describe("loadOpenApiSpec", () => {
    it("loads valid JSON file", async () => {
      const filePath = path.join(tmpDir, "valid.json");
      fs.writeFileSync(filePath, JSON.stringify(validSpec), "utf-8");
      const result = await loadOpenApiSpec(filePath);
      expect(result.openapi).toBe("3.1.0");
      expect(result.info.title).toBe("Test API");
    });

    it("loads valid YAML file", async () => {
      const yaml = `openapi: "3.1.0"
info:
  title: YAML File Test
  version: "1.0.0"
paths:
  /health:
    get:
      operationId: healthCheck
      responses:
        "200":
          description: OK
`;
      const filePath = path.join(tmpDir, "valid.yaml");
      fs.writeFileSync(filePath, yaml, "utf-8");
      const result = await loadOpenApiSpec(filePath);
      expect(result.openapi).toBe("3.1.0");
      expect(result.info.title).toBe("YAML File Test");
    });

    it("loads valid .yml file", async () => {
      const yaml = `openapi: "3.1.0"
info:
  title: YML File Test
  version: "1.0.0"
paths:
  /health:
    get:
      operationId: healthCheck
      responses:
        "200":
          description: OK
`;
      const filePath = path.join(tmpDir, "valid.yml");
      fs.writeFileSync(filePath, yaml, "utf-8");
      const result = await loadOpenApiSpec(filePath);
      expect(result.info.title).toBe("YML File Test");
    });

    it("throws for non-existent file", async () => {
      const filePath = path.join(tmpDir, "nonexistent.json");
      await expect(loadOpenApiSpec(filePath)).rejects.toThrow();
    });

    it("throws for invalid JSON file", async () => {
      const filePath = path.join(tmpDir, "invalid.json");
      fs.writeFileSync(filePath, "{invalid", "utf-8");
      await expect(loadOpenApiSpec(filePath)).rejects.toThrow("Failed to parse JSON");
    });
  });
});
