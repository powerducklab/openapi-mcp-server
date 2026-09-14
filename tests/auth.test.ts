import { describe, expect, it } from "vitest";
import { createAuthMiddleware } from "../src/server/auth.js";

function createMockRes() {
  const res: any = {
    statusCode: 0,
    responseBody: null,
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    set: (_key: string, _value: string) => res,
    json: (body: any) => {
      res.responseBody = body;
      return res;
    },
  };
  return res;
}

describe("auth", () => {
  describe("createAuthMiddleware", () => {
    it("returns a middleware function", () => {
      const middleware = createAuthMiddleware("test-api-key");
      expect(typeof middleware).toBe("function");
    });

    it("returns middleware when no apiKey provided", () => {
      const middleware = createAuthMiddleware();
      expect(typeof middleware).toBe("function");
    });

    it("throws when apiKey is empty string", () => {
      expect(() => createAuthMiddleware("")).toThrow();
    });

    it("middleware accepts 3 arguments (req, res, next)", () => {
      const middleware = createAuthMiddleware("test-key");
      expect(middleware.length).toBe(3);
    });
  });

  describe("middleware behavior", () => {
    it("calls next() when no apiKey is configured", () => {
      const middleware = createAuthMiddleware();
      let nextCalled = false;
      const req: any = { headers: {} };
      const res = createMockRes();
      const next = () => {
        nextCalled = true;
      };
      middleware(req, res, next);
      expect(nextCalled).toBe(true);
    });

    it("calls next() when apiKey matches via x-api-key", () => {
      const middleware = createAuthMiddleware("secret-key");
      let nextCalled = false;
      const req: any = {
        headers: { "x-api-key": "secret-key" },
      };
      const res = createMockRes();
      const next = () => {
        nextCalled = true;
      };
      middleware(req, res, next);
      expect(nextCalled).toBe(true);
    });

    it("calls next() when apiKey matches via authorization bearer", () => {
      const middleware = createAuthMiddleware("secret-key");
      let nextCalled = false;
      const req: any = {
        headers: { authorization: "Bearer secret-key" },
      };
      const res = createMockRes();
      const next = () => {
        nextCalled = true;
      };
      middleware(req, res, next);
      expect(nextCalled).toBe(true);
    });

    it("returns 401 when apiKey does not match", () => {
      const middleware = createAuthMiddleware("secret-key");
      const req: any = {
        headers: { "x-api-key": "wrong-key" },
      };
      const res = createMockRes();
      const next = () => {};
      middleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.responseBody).toBeDefined();
    });

    it("returns 401 when no apiKey header provided", () => {
      const middleware = createAuthMiddleware("secret-key");
      const req: any = { headers: {} };
      const res = createMockRes();
      const next = () => {};
      middleware(req, res, next);
      expect(res.statusCode).toBe(401);
    });

    it("is case-insensitive for Bearer prefix in authorization header", () => {
      const middleware = createAuthMiddleware("test-key");
      let nextCalled = false;
      const req: any = {
        headers: { authorization: "BEARER test-key" },
      };
      const res = createMockRes();
      const next = () => {
        nextCalled = true;
      };
      middleware(req, res, next);
      expect(nextCalled).toBe(true);
    });

    it("error response includes error message", () => {
      const middleware = createAuthMiddleware("secret-key");
      const req: any = { headers: {} };
      const res = createMockRes();
      const next = () => {};
      middleware(req, res, next);
      expect(res.responseBody.error).toBeDefined();
      expect(typeof res.responseBody.error).toBe("string");
    });

    it("calls next() for OPTIONS preflight requests", () => {
      const middleware = createAuthMiddleware("secret-key");
      let nextCalled = false;
      const req: any = { method: "OPTIONS", headers: {} };
      const res = createMockRes();
      const next = () => {
        nextCalled = true;
      };
      middleware(req, res, next);
      expect(nextCalled).toBe(true);
    });
  });
});
