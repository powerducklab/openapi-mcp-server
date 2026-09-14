import { describe, expect, it, beforeEach } from "vitest";
import { ServiceRegistry } from "../src/runtime/service-registry.js";
import type { ManagedServiceRecord } from "../src/types.js";

function makeRecord(overrides: Partial<ManagedServiceRecord> = {}): ManagedServiceRecord {
  return {
    id: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    specPath: "./openapi.yaml",
    transport: "stdio",
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("service-registry", () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  describe("initialization", () => {
    it("creates a new registry instance", () => {
      expect(registry).toBeInstanceOf(ServiceRegistry);
    });

    it("starts with no services", () => {
      const services = registry.list();
      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBe(0);
    });
  });

  describe("upsert", () => {
    it("adds a new service record", () => {
      const record = makeRecord({ specPath: "./api1.yaml" });
      registry.upsert(record);
      expect(registry.list()).toHaveLength(1);
      expect(registry.get(record.id)?.specPath).toBe("./api1.yaml");
    });

    it("updates an existing service record", () => {
      const record = makeRecord({ specPath: "./api1.yaml", status: "running" });
      registry.upsert(record);
      const updated = { ...record, status: "stopped", updatedAt: new Date().toISOString() };
      registry.upsert(updated);
      expect(registry.list()).toHaveLength(1);
      expect(registry.get(record.id)?.status).toBe("stopped");
    });

    it("handles multiple services", () => {
      registry.upsert(makeRecord({ id: "svc-1", specPath: "./api1.yaml" }));
      registry.upsert(makeRecord({ id: "svc-2", specPath: "./api2.yaml" }));
      expect(registry.list()).toHaveLength(2);
    });
  });

  describe("get", () => {
    it("returns registered service by ID", () => {
      const record = makeRecord({ id: "test-svc", specPath: "./openapi.yaml" });
      registry.upsert(record);
      const service = registry.get("test-svc");
      expect(service).toBeDefined();
      expect(service?.specPath).toBe("./openapi.yaml");
    });

    it("returns undefined for non-existent ID", () => {
      expect(registry.get("non-existent-id")).toBeUndefined();
    });
  });

  describe("list", () => {
    it("returns all registered services", () => {
      registry.upsert(makeRecord({ id: "svc-1", specPath: "./api1.yaml" }));
      registry.upsert(makeRecord({ id: "svc-2", specPath: "./api2.yaml", transport: "http" }));
      const services = registry.list();
      expect(services).toHaveLength(2);
    });

    it("returns empty array when no services", () => {
      expect(registry.list()).toEqual([]);
    });

    it("returns services sorted by createdAt", () => {
      const earlier = makeRecord({ id: "svc-1", createdAt: "2024-01-01T00:00:00.000Z" });
      const later = makeRecord({ id: "svc-2", createdAt: "2024-01-02T00:00:00.000Z" });
      registry.upsert(later);
      registry.upsert(earlier);
      const services = registry.list();
      expect(services[0]?.id).toBe("svc-1");
      expect(services[1]?.id).toBe("svc-2");
    });
  });

  describe("remove", () => {
    it("removes a registered service", () => {
      const record = makeRecord({ id: "test-svc" });
      registry.upsert(record);
      expect(registry.list()).toHaveLength(1);
      registry.remove("test-svc");
      expect(registry.list()).toHaveLength(0);
    });

    it("returns true when removing existing service", () => {
      const record = makeRecord({ id: "test-svc" });
      registry.upsert(record);
      expect(registry.remove("test-svc")).toBe(true);
    });

    it("returns false when removing non-existent service", () => {
      expect(registry.remove("non-existent-id")).toBe(false);
    });

    it("does not throw when removing already removed service", () => {
      const record = makeRecord({ id: "test-svc" });
      registry.upsert(record);
      registry.remove("test-svc");
      expect(() => registry.remove("test-svc")).not.toThrow();
    });
  });

  describe("clear", () => {
    it("removes all services", () => {
      registry.upsert(makeRecord({ id: "svc-1" }));
      registry.upsert(makeRecord({ id: "svc-2" }));
      expect(registry.list()).toHaveLength(2);
      registry.clear();
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe("start", () => {
    it("starts a stopped service", () => {
      const record = makeRecord({ id: "test-svc", status: "stopped" });
      registry.upsert(record);
      const started = registry.start("test-svc");
      expect(started).toBeDefined();
      expect(started?.status).toBe("running");
    });

    it("returns undefined for non-existent service", () => {
      expect(registry.start("non-existent")).toBeUndefined();
    });
  });

  describe("stop", () => {
    it("stops a running service", () => {
      const record = makeRecord({ id: "test-svc", status: "running" });
      registry.upsert(record);
      const stopped = registry.stop("test-svc");
      expect(stopped).toBeDefined();
      expect(stopped?.status).toBe("stopped");
    });

    it("returns undefined for non-existent service", () => {
      expect(registry.stop("non-existent")).toBeUndefined();
    });
  });

  describe("service metadata", () => {
    it("stores transport type", () => {
      const record = makeRecord({ transport: "http", port: 3000 });
      registry.upsert(record);
      const service = registry.get(record.id);
      expect(service?.transport).toBe("http");
    });

    it("stores creation timestamp", () => {
      const record = makeRecord({ createdAt: "2024-01-01T00:00:00.000Z" });
      registry.upsert(record);
      const service = registry.get(record.id);
      expect(service?.createdAt).toBe("2024-01-01T00:00:00.000Z");
    });

    it("stores status", () => {
      const record = makeRecord({ status: "running" });
      registry.upsert(record);
      const service = registry.get(record.id);
      expect(service?.status).toBe("running");
    });
  });
});
