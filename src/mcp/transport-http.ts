// src/mcp/transport-http.ts
import express, { type Express, type RequestHandler } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  buildMcpServer,
  type ContextProvider,
  type SpecProvider,
} from "./create-server";
import { createStreamableSessionHost } from "./session-host";
import type {
  McpSessionEvent,
  McpSessionInfo,
  SessionCloseReason,
  SessionKind,
} from "./session-types";

/** Endpoint paths mounted by {@link attachMcpRoutes}. */
export const MCP_ROUTES = {
  /** Streamable HTTP endpoint (POST/GET/DELETE). Preferred by modern clients. */
  streamableHttp: "/mcp",
  /** Legacy HTTP+SSE stream endpoint. */
  sse: "/sse",
  /** Legacy HTTP+SSE message endpoint. */
  messages: "/mcp/messages",
} as const;

/** Hard cap on concurrent sessions, protecting the process from exhaustion. */
const DEFAULT_MAX_SESSIONS = 64;
/** Interval between SSE keep-alive comments, to survive proxy idle timeouts. */
const KEEPALIVE_INTERVAL_MS = 25 * 1000;
/** Upper bound on how long closeAll waits for in-flight teardowns. */
const DRAIN_TIMEOUT_MS = 5 * 1000;

export type {
  McpSessionEvent,
  McpSessionInfo,
  SessionCloseReason,
  SessionKind,
} from "./session-types";

export interface AttachMcpRoutesOptions {
  /** Supplies the document backing every new session. */
  specProvider: SpecProvider;
  /** Supplies the per-call upstream execution context. */
  contextProvider: ContextProvider;
  /** Applied to every MCP route when provided. */
  routeGuard?: express.RequestHandler | undefined;
  /** Maximum concurrent sessions. Defaults to 64. */
  maxSessions?: number | undefined;
  /** Idle timeout in milliseconds. Defaults to 10 minutes. Zero disables it. */
  sessionIdleMs?: number | undefined;
  /**
   * Origins permitted to open a session. When non-empty, DNS rebinding
   * protection is enabled, which is strongly recommended for any server
   * reachable from a browser.
   */
  allowedOrigins?: string[] | undefined;
  /** Host header values permitted. Pairs with {@link allowedOrigins}. */
  allowedHosts?: string[] | undefined;
  /** Enables the deprecated HTTP+SSE transport. Defaults to true. */
  enableLegacySse?: boolean | undefined;
  /** Receives lifecycle notices. Must never throw. */
  onEvent?: ((event: McpSessionEvent) => void) | undefined;
}

export interface McpRouteHandle {
  activeSessionCount: () => number;
  /** Sessions mid-handshake, i.e. counted against capacity but not yet listed. */
  pendingSessionCount: () => number;
  listSessions: () => McpSessionInfo[];
  /** Resolves true when the session existed and was closed by this call. */
  closeSession: (
    sessionId: string,
    reason?: SessionCloseReason,
  ) => Promise<boolean>;
  closeAll: () => Promise<void>;
  /** Stops the background sweeper and closes every session. */
  dispose: () => Promise<void>;
}

interface SseSessionRecord {
  sessionId: string;
  transport: SSEServerTransport;
  server: ReturnType<typeof buildMcpServer>;
  createdAt: number;
  keepAlive?: NodeJS.Timeout | undefined;
  closing: boolean;
  remoteAddress?: string | undefined;
  userAgent?: string | undefined;
}

/** JSON-RPC error payload for failures that occur before a session exists. */
function rpcError(code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id: null, error: { code, message } };
}

function readHeader(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim() !== "",
    );
    return first?.trim();
  }
  return undefined;
}

/** Express 5 widens query values; collapse to a single usable string. */
function readQueryValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const first = value.find(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim() !== "",
    );
    return first?.trim() ?? "";
  }
  return "";
}

function asTransport(value: object): Transport {
  return value as unknown as Transport;
}

/**
 * Mounts both MCP HTTP transports on the given app.
 *
 * `/mcp` serves the stateful Streamable HTTP transport through the shared
 * framework-agnostic session host. `/sse` plus `/mcp/messages` keep the
 * deprecated HTTP+SSE transport available for pinned clients.
 *
 * The JSON body parser must already be installed on the app: both transports
 * are handed `request.body` rather than re-reading the stream.
 */
export function attachMcpRoutes(
  app: Express,
  options: AttachMcpRoutesOptions,
): McpRouteHandle {
  const { specProvider, contextProvider } = options;

  const maxSessions = Math.max(
    1,
    options.maxSessions ?? DEFAULT_MAX_SESSIONS,
  );
  const legacyEnabled = options.enableLegacySse !== false;
  const sseSessions = new Map<string, SseSessionRecord>();

  const emit = (event: McpSessionEvent): void => {
    try {
      options.onEvent?.(event);
    } catch {
      // Observability must never break traffic.
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Streamable HTTP (shared host)                                          */
  /* ---------------------------------------------------------------------- */

  const streamable = createStreamableSessionHost({
    specProvider,
    contextProvider,
    maxSessions,
    ...(options.sessionIdleMs !== undefined
      ? { sessionIdleMs: options.sessionIdleMs }
      : {}),
    ...(options.allowedOrigins?.length
      ? { allowedOrigins: options.allowedOrigins }
      : {}),
    ...(options.allowedHosts?.length
      ? { allowedHosts: options.allowedHosts }
      : {}),
    onEvent: emit,
  });

  const guard = options.routeGuard ? [options.routeGuard] : [];

  const handleStreamable: RequestHandler = async (request, response) => {
    await streamable.handle(request, response, request.body);
  };

  app.post(MCP_ROUTES.streamableHttp, ...guard, handleStreamable);
  app.get(MCP_ROUTES.streamableHttp, ...guard, handleStreamable);
  // DELETE is how a client explicitly terminates its session.
  app.delete(MCP_ROUTES.streamableHttp, ...guard, handleStreamable);

  /* ---------------------------------------------------------------------- */
  /* Legacy HTTP+SSE transport                                              */
  /* ---------------------------------------------------------------------- */

  async function destroySseSession(
    sessionId: string,
    reason: SessionCloseReason,
  ): Promise<boolean> {
    const record = sseSessions.get(sessionId);
    if (!record || record.closing) return false;

    record.closing = true;
    sseSessions.delete(sessionId);
    if (record.keepAlive) clearInterval(record.keepAlive);

    try {
      await record.transport.close();
    } catch {
      // The socket may already be gone.
    }
    try {
      await record.server.close();
    } catch {
      // Closing an already-closed server is not an error.
    }

    emit({ type: "session-closed", kind: "sse", sessionId, reason });
    return true;
  }

  if (legacyEnabled) {
    app.get(MCP_ROUTES.sse, ...guard, async (request, response) => {
      // Origin is validated manually here: the legacy transport has no built-in
      // DNS rebinding protection. A missing Origin header is allowed through
      // because non-browser clients never send one.
      const sseOrigins = options.allowedOrigins?.filter(
        (entry) => Boolean(entry) && entry !== "*",
      );
      if (sseOrigins?.length) {
        const origin = readHeader(request.headers.origin);
        if (origin && !sseOrigins.includes(origin)) {
          emit({ type: "session-rejected", kind: "sse", reason: "origin" });
          response.status(403).json(rpcError(-32000, "Origin is not allowed."));
          return;
        }
      }

      if (!specProvider()) {
        emit({ type: "session-rejected", kind: "sse", reason: "no-active-spec" });
        response
          .status(503)
          .json(
            rpcError(
              -32000,
              "No MCP service is currently running. Load a specification and start the service first.",
            ),
          );
        return;
      }

      // Capacity is shared with the Streamable HTTP host.
      const current =
        streamable.activeSessionCount() +
        streamable.pendingSessionCount() +
        sseSessions.size;
      if (current >= maxSessions) {
        emit({ type: "session-rejected", kind: "sse", reason: "capacity" });
        response
          .status(429)
          .json(
            rpcError(
              -32000,
              `Too many concurrent MCP sessions (limit ${maxSessions}).`,
            ),
          );
        return;
      }

      const server = buildMcpServer(specProvider, contextProvider, {
        protocol: "sse",
      });
      const transport = new SSEServerTransport(MCP_ROUTES.messages, response);
      const sessionId = transport.sessionId;
      const now = Date.now();

      sseSessions.set(sessionId, {
        sessionId,
        transport,
        server,
        createdAt: now,
        closing: false,
        remoteAddress: request.ip,
        userAgent: readHeader(request.headers["user-agent"]),
      });

      // The response can be destroyed before connect() resolves; the close and
      // error events are the only signals that the peer went away.
      response.on("close", () => void destroySseSession(sessionId, "client-closed"));
      response.on("error", () => void destroySseSession(sessionId, "stream-error"));

      try {
        await server.connect(asTransport(transport));
      } catch (error) {
        emit({
          type: "session-error",
          kind: "sse",
          sessionId,
          reason: error instanceof Error ? error.message : String(error),
        });
        await destroySseSession(sessionId, "connect-failed");
        if (!response.headersSent) {
          response
            .status(500)
            .json(rpcError(-32603, "Failed to initialize the MCP session."));
        }
        return;
      }

      // Started only after connect: the transport writes the SSE preamble during
      // connect, and a keep-alive comment emitted before that would land ahead
      // of the response headers. write() reports back-pressure failures through
      // its callback rather than by throwing.
      const keepAlive = setInterval(() => {
        if (response.writableEnded || response.destroyed) return;
        response.write(": keepalive\n\n", (error) => {
          if (error) void destroySseSession(sessionId, "keepalive-write-failed");
        });
      }, KEEPALIVE_INTERVAL_MS);
      keepAlive.unref?.();
      const record = sseSessions.get(sessionId);
      if (record) record.keepAlive = keepAlive;

      emit({ type: "session-opened", kind: "sse", sessionId });
    });

    app.post(MCP_ROUTES.messages, ...guard, async (request, response) => {
      const sessionId =
        readQueryValue(request.query.sessionId) ||
        readHeader(request.headers["mcp-session-id"]) ||
        "";

      if (!sessionId) {
        response
          .status(400)
          .json(rpcError(-32000, "A sessionId query parameter is required."));
        return;
      }

      const record = sseSessions.get(sessionId);
      if (!record || record.closing) {
        response
          .status(404)
          .json(rpcError(-32001, "Unknown or expired sessionId."));
        return;
      }

      try {
        await record.transport.handlePostMessage(
          request,
          response,
          request.body,
        );
      } catch (error) {
        emit({
          type: "session-error",
          kind: "sse",
          sessionId,
          reason: error instanceof Error ? error.message : String(error),
        });
        if (!response.headersSent) {
          response
            .status(500)
            .json(rpcError(-32603, "Failed to dispatch the MCP message."));
        } else {
          response.end();
        }
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Unified handle                                                         */
  /* ---------------------------------------------------------------------- */

  return {
    activeSessionCount: () =>
      streamable.activeSessionCount() + sseSessions.size,
    pendingSessionCount: () => streamable.pendingSessionCount(),
    listSessions: () => [
      ...streamable.listSessions(),
      ...[...sseSessions.values()].map((record) => ({
        sessionId: record.sessionId,
        kind: "sse" as const,
        createdAt: new Date(record.createdAt).toISOString(),
        lastActivityAt: new Date(record.createdAt).toISOString(),
        remoteAddress: record.remoteAddress,
        userAgent: record.userAgent,
      })),
    ],
    closeSession: async (sessionId, reason = "closed-by-operator") => {
      const viaStreamable = await streamable.closeSession(sessionId, reason);
      if (viaStreamable) return true;
      return destroySseSession(sessionId, reason);
    },
    closeAll: async () => {
      const drain = [
        streamable.closeAll(),
        ...[...sseSessions.keys()].map((sessionId) =>
          destroySseSession(sessionId, "shutdown"),
        ),
      ];
      const timeout = new Promise((resolve) =>
        setTimeout(resolve, DRAIN_TIMEOUT_MS).unref?.(),
      );
      await Promise.race([Promise.all(drain), timeout]);
    },
    dispose: async () => {
      await streamable.dispose();
      await Promise.all(
        [...sseSessions.keys()].map((sessionId) =>
          destroySseSession(sessionId, "shutdown"),
        ),
      );
    },
  };
}

/**
 * Backwards-compatible alias for the previous export name.
 *
 * @deprecated Use {@link attachMcpRoutes}. This wrapper keeps the old
 * positional signature working but no longer serves the legacy SSE stream at
 * `GET /mcp`, because that path now belongs to the Streamable HTTP transport.
 */
export function attachSseRoutes(
  app: Express,
  specProvider: SpecProvider,
  contextProvider: ContextProvider,
  routeGuard?: express.RequestHandler,
): { activeSessionCount: () => number; closeAll: () => Promise<void> } {
  const handle = attachMcpRoutes(app, {
    specProvider,
    contextProvider,
    ...(routeGuard ? { routeGuard } : {}),
  });
  return {
    activeSessionCount: handle.activeSessionCount,
    closeAll: handle.closeAll,
  };
}
