import { describe, expect, it } from "vitest";
import * as mod from "../src/index.js";

describe("module exports", () => {
  it("exports core OpenAPI loader functions", () => {
    expect(typeof mod.loadOpenApiSpec).toBe("function");
    expect(typeof mod.parseSpecContent).toBe("function");
  });

  it("exports tool generator functions", () => {
    expect(typeof mod.generateTools).toBe("function");
    expect(typeof mod.generateToolsDetailed).toBe("function");
    expect(typeof mod.buildBindingIndex).toBe("function");
  });

  it("exports prompt and resource registry functions", () => {
    expect(typeof mod.generatePrompts).toBe("function");
    expect(typeof mod.resolvePrompt).toBe("function");
    expect(typeof mod.generateResources).toBe("function");
    expect(typeof mod.readResource).toBe("function");
  });

  it("exports HTTP executor", () => {
    expect(typeof mod.executeToolCall).toBe("function");
  });

  it("exports spec utility functions", () => {
    expect(typeof mod.iterateOperations).toBe("function");
    expect(typeof mod.collectOperationParameters).toBe("function");
    expect(typeof mod.synthesizeOperationId).toBe("function");
    expect(typeof mod.ensureUniqueName).toBe("function");
    expect(typeof mod.extractPathTemplateVariables).toBe("function");
    expect(typeof mod.effectiveStyle).toBe("function");
    expect(typeof mod.effectiveExplode).toBe("function");
    expect(typeof mod.findOperationById).toBe("function");
    expect(typeof mod.findDuplicateOperationIds).toBe("function");
    expect(typeof mod.assertUniqueOperationIds).toBe("function");
    expect(typeof mod.isPlainObject).toBe("function");
    expect(typeof mod.truncateGeneratedName).toBe("function");
  });

  it("exports request builder", () => {
    expect(typeof mod.buildRequest).toBe("function");
  });

  it("exports MCP server functions", () => {
    expect(typeof mod.buildMcpServer).toBe("function");
    expect(typeof mod.startStdioServer).toBe("function");
    expect(typeof mod.attachSseRoutes).toBe("function");
  });

  it("exports admin server and auth", () => {
    expect(typeof mod.startAdminServer).toBe("function");
    expect(typeof mod.createAuthMiddleware).toBe("function");
  });

  it("exports global utilities", () => {
    expect(typeof mod.isAbortError).toBe("function");
    expect(typeof mod.newId).toBe("function");
  });

  it("exports ServiceRegistry class", () => {
    expect(typeof mod.ServiceRegistry).toBe("function");
  });

  it("does not export @scalar packages directly", () => {
    const keys = Object.keys(mod);
    expect(keys.some((k) => k.includes("scalar") || k.includes("Scalar"))).toBe(false);
  });
});
