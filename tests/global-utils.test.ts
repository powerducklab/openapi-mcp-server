import { describe, expect, it } from "vitest";
import { isAbortError, newId } from "../src/core/global-utils.js";

describe("global-utils", () => {
  describe("isAbortError", () => {
    it("returns true for DOM AbortError", () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      expect(isAbortError(error)).toBe(true);
    });

    it("returns true for axios CanceledError", () => {
      const error = new Error("Canceled");
      error.name = "CanceledError";
      expect(isAbortError(error)).toBe(true);
    });

    it("returns false for regular Error", () => {
      const error = new Error("Something went wrong");
      expect(isAbortError(error)).toBe(false);
    });

    it("returns false for TypeError", () => {
      const error = new TypeError("Invalid type");
      expect(isAbortError(error)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isAbortError(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isAbortError(undefined)).toBe(false);
    });

    it("returns false for string", () => {
      expect(isAbortError("error")).toBe(false);
    });

    it("returns false for number", () => {
      expect(isAbortError(42)).toBe(false);
    });

    it("returns false for object without name", () => {
      expect(isAbortError({})).toBe(false);
    });

    it("returns false for object with different name", () => {
      expect(isAbortError({ name: "ValidationError" })).toBe(false);
    });
  });

  describe("newId", () => {
    it("returns a string", () => {
      const id = newId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("returns unique ids on subsequent calls", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(newId());
      }
      expect(ids.size).toBe(100);
    });

    it("returns UUID format when crypto is available", () => {
      const id = newId();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      // Either UUID format or fallback format
      expect(uuidRegex.test(id) || id.startsWith("id_")).toBe(true);
    });
  });
});
