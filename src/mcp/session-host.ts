import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  buildMcpServer,
  type BuildMcpServerOptions,
  type ContextProvider,
  type SpecProvider,
} from "./create-server.js";
import type {
  McpSessionEvent,
  McpSessionInfo,
  SessionCloseReason,
} from "./session-types.js";

/** Hard cap on concurrent sessions, protecting the process from exhaustion. */
const DEFAULT_MAX_SESSIONS = 64;
/** Idle sessions are reclaimed after this long without traffic. */
const DEFAULT_SESSION_IDLE_MS = 10 * 60 * 1000;
/** How often expired sessions are swept. */
const SWEEP_INTERVAL_MS = 30 * 1000;
/** Upper bound on how long closeAll waits for in-flight teardowns. */
const DRAIN_TIMEOUT_MS = 5 * 1000;

export interface StreamableSessionHostOptions {
  /** Supplies the document backing every new session. */
  specProvider: SpecProvider;
  /** Supplies the per-call upstream execution context. */
  contextProvider?: ContextProvider;
  /** Options forwarded to every built MCP server (name, version, pageSize). */
  server?: BuildMcpServerOptions;
  /** Maximum concurrent sessions. Defaults to 64. */
  maxSessions?: number;
  /** Idle timeout in milliseconds. Defaults to 10 minutes. Zero disables it. */
  sessionIdleMs?: number;
  /**
   * Origins permitted to open a session. When non-empty, DNS rebinding
   * protection is enabled, which is strongly recommended for any endpoint
   * reachable from a browser.
   */
  allowedOrigins?: string[];
  /** Host header values permitted. Pairs with {@link allowedOrigins}. */
  allowedHosts?: string[];
  /** Receives lifecycle notices. Must never throw. */
  onEvent?: (event: McpSessionEvent) => void;
}

export interface StreamableSessionHost {
  activeSessionCount: () => number;
  /** Sessions mid-handshake, counted against capacity but not yet listed. */
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
  /**
   * Handles one raw HTTP request. The embedding framework is responsible for
   * any request hijacking; the host only reads/writes the native message and
   * response. `body` is the already-parsed JSON payload.
   */
  handle: (
    request: IncomingMessage,
    response: ServerResponse,
    body: unknown,
  ) => Promise<void>;
}

interface SessionRecord {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  server: ReturnType<typeof buildMcpServer>;
  createdAt: number;
  lastActivityAt: number;
  closing: boolean;
  remoteAddress?: string | undefined;
  userAgent?: string | undefined;
}

/** JSON-RPC error payload for failures that occur before a session exists. */
function rpcError(code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id: null, error: { code, message } };
}

function sendJsonRpc(
  response: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The SDK is not compiled with `exactOptionalPropertyTypes`, so its transport
 * classes are not structurally assignable to the `Transport` interface under
 * that flag. The mismatch is a declaration-level artifact only.
 */
function asTransport(value: object): Transport {
  return value as unknown as Transport;
}

/**
 * Installs an additional close handler without discarding the existing one.
 * `Server.connect()` assigns its own `onclose`/`onerror` on the transport, so a
 * handler registered before connect is silently overwritten.
 */
function chainOnClose(
  transport: { onclose?: (() => void) | undefined },
  handler: () => void,
): void {
  const previous = transport.onclose;
  transport.onclose = (): void => {
    try {
      previous?.();
    } finally {
      handler();
    }
  };
}

function chainOnError(
  transport: { onerror?: ((error: Error) => void) | undefined },
  handler: (error: Error) => void,
): void {
  const previous = transport.onerror;
  transport.onerror = (error: Error): void => {
    try {
      previous?.(error);
    } finally {
      handler(error);
    }
  };
}

/**
 * Creates a framework-agnostic host for stateful Streamable HTTP sessions.
 *
 * The host speaks only the native Node request/response pair, so an Express
 * app and a hijacked Fastify route can share the exact same session lifecycle.
 */
export function createStreamableSessionHost(
  options: StreamableSessionHostOptions,
): StreamableSessionHost {
  const specProvider = options.specProvider;
  const contextProvider = options.contextProvider;

  const sessions = new Map<string, SessionRecord>();
  /** Closures in flight, keyed by session id. */
  const closures = new Map<string, Promise<void>>();
  /** Handshakes admitted but not yet holding a session id. */
  let pending = 0;

  const maxSessions = Math.max(
    1,
    options.maxSessions ?? DEFAULT_MAX_SESSIONS,
  );
  const idleMs = Math.max(0, options.sessionIdleMs ?? DEFAULT_SESSION_IDLE_MS);

  // A wildcard entry is meaningless for a host/origin allow-list and would
  // make the guard reject everything, so it is filtered out here.
  const allowedOrigins =
    options.allowedOrigins?.filter(
      (entry) => Boolean(entry) && entry !== "*",
    ) ?? [];
  const configuredHosts = options.allowedHosts?.filter(Boolean) ?? [];

  // Only enable the SDK's host/origin checks when a concrete allow-list exists;
  // enabling them with an empty list would reject every request.
  const dnsProtection = allowedOrigins.length > 0 || configuredHosts.length > 0;

  /**
   * The SDK validates Host *and* Origin whenever protection is on. Deriving the
   * hosts from the configured origins keeps the common "I only listed my web
   * origin" case working instead of rejecting on an empty host list.
   */
  const allowedHosts =
    configuredHosts.length > 0
      ? configuredHosts
      : allowedOrigins
          .map((origin) => {
            try {
              return new URL(origin).host;
            } catch {
              return "";
            }
          })
          .filter(Boolean);

  const emit = (event: McpSessionEvent): void => {
    try {
      options.onEvent?.(event);
    } catch {
      // Observability must never break traffic.
    }
  };

  function touch(sessionId: string): void {
    const record = sessions.get(sessionId);
    if (record) record.lastActivityAt = Date.now();
  }

  async function destroySession(
    sessionId: string,
    reason: SessionCloseReason,
  ): Promise<boolean> {
    const record = sessions.get(sessionId);
    if (!record || record.closing) return false;

    // Mark and unregister before awaiting: `transport.close()` synchronously
    // fires `onclose`, which re-enters this function for the same session.
    record.closing = true;
    sessions.delete(sessionId);

    const closure = (async () => {
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
    })();

    closures.set(sessionId, closure);
    try {
      await closure;
    } finally {
      closures.delete(sessionId);
    }

    emit({ type: "session-closed", kind: "streamable-http", sessionId, reason });
    return true;
  }

  /** Rejects a new session when the spec is unavailable or capacity is full. */
  function admit(response: ServerResponse): boolean {
    if (!specProvider()) {
      emit({ type: "session-rejected", kind: "streamable-http", reason: "no-active-spec" });
      sendJsonRpc(
        response,
        503,
        rpcError(
          -32000,
          "No MCP service is currently running. Load a specification and start the service first.",
        ),
      );
      return false;
    }
    if (sessions.size + pending >= maxSessions) {
      emit({ type: "session-rejected", kind: "streamable-http", reason: "capacity" });
      sendJsonRpc(
        response,
        429,
        rpcError(
          -32000,
          `Too many concurrent MCP sessions (limit ${maxSessions}).`,
        ),
      );
      return false;
    }
    return true;
  }

  /** Creates a Streamable HTTP session and hands the initialize request to it. */
  async function openSession(
    request: IncomingMessage,
    response: ServerResponse,
    body: unknown,
  ): Promise<void> {
    const server = buildMcpServer(specProvider, contextProvider, {
      ...options.server,
      protocol: "streamable-http",
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: dnsProtection,
      ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
      ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
      onsessioninitialized: (sessionId: string): void => {
        const now = Date.now();
        sessions.set(sessionId, {
          sessionId,
          transport,
          server,
          createdAt: now,
          lastActivityAt: now,
          closing: false,
          remoteAddress: request.socket.remoteAddress,
          userAgent: readHeader(request.headers["user-agent"]),
        });
        emit({ type: "session-opened", kind: "streamable-http", sessionId });
      },
      onsessionclosed: (sessionId: string): void => {
        void destroySession(sessionId, "client-terminated");
      },
    });

    const rollback = async (): Promise<void> => {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    };

    pending += 1;
    try {
      try {
        await server.connect(asTransport(transport));
      } catch (error) {
        await rollback();
        emit({
          type: "session-error",
          kind: "streamable-http",
          reason: describe(error),
        });
        sendJsonRpc(response, 500, rpcError(-32603, "Failed to initialize the MCP session."));
        return;
      }

      // Registered only after connect, because connect installs the SDK's own
      // onclose/onerror and would otherwise overwrite these handlers.
      chainOnClose(transport, () => {
        const sessionId = transport.sessionId;
        if (sessionId) void destroySession(sessionId, "transport-closed");
      });

      chainOnError(transport, (error) => {
        emit({
          type: "session-error",
          kind: "streamable-http",
          sessionId: transport.sessionId,
          reason: error.message,
        });
      });

      try {
        // This performs the initialize handshake and triggers
        // `onsessioninitialized` on success, registering the session.
        await transport.handleRequest(request, response, body);
      } catch (error) {
        const sessionId = transport.sessionId;
        if (sessionId && sessions.has(sessionId)) {
          await destroySession(sessionId, "initialize-failed");
        } else {
          await rollback();
        }
        emit({
          type: "session-error",
          kind: "streamable-http",
          sessionId,
          reason: describe(error),
        });
        sendJsonRpc(response, 500, rpcError(-32603, "Failed to handle the initialize request."));
        return;
      }

      // No session id means the payload was rejected at the protocol level;
      // the transport already wrote the response. Release the server.
      if (!transport.sessionId) {
        await rollback();
      }
    } finally {
      pending -= 1;
    }
  }

  const handle = async (
    request: IncomingMessage,
    response: ServerResponse,
    body: unknown,
  ): Promise<void> => {
    const method = request.method ?? "";
    const sessionId = readHeader(request.headers["mcp-session-id"]);

    try {
      if (sessionId) {
        const record = sessions.get(sessionId);
        if (!record || record.closing) {
          sendJsonRpc(response, 404, rpcError(-32001, "Unknown or expired MCP session."));
          return;
        }

        // Stamp before and after: a streaming GET can stay open for a long
        // time, and only stamping on completion would let the idle reaper cut
        // a session that is actively serving a client. The SDK handles GET,
        // POST and DELETE through this same call.
        touch(sessionId);
        await record.transport.handleRequest(request, response, body);
        touch(sessionId);
        return;
      }

      // Without a session header, only a well-formed initialize POST may open
      // a session.
      if (method !== "POST") {
        sendJsonRpc(
          response,
          400,
          rpcError(
            -32000,
            "Missing mcp-session-id header. Send an initialize request over POST first, or use the legacy /sse endpoint.",
          ),
        );
        return;
      }

      if (!isInitializeRequest(body)) {
        sendJsonRpc(
          response,
          400,
          rpcError(
            -32000,
            "Missing mcp-session-id header and the payload is not an initialize request. The session may have expired; re-initialize before retrying.",
          ),
        );
        return;
      }

      if (!admit(response)) return;

      // openSession answers this very request as part of the handshake.
      await openSession(request, response, body);
    } catch (error) {
      emit({
        type: "session-error",
        kind: "streamable-http",
        sessionId,
        reason: describe(error),
      });
      if (!response.headersSent) {
        sendJsonRpc(
          response,
          500,
          rpcError(-32603, "Internal error while handling the MCP request."),
        );
      } else {
        response.end();
      }
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Idle session reaper                                                    */
  /* ---------------------------------------------------------------------- */

  let sweeper: NodeJS.Timeout | undefined;
  if (idleMs > 0) {
    sweeper = setInterval(() => {
      const cutoff = Date.now() - idleMs;
      // Snapshot first: destroySession mutates the map while iterating.
      for (const record of [...sessions.values()]) {
        if (record.lastActivityAt < cutoff) {
          void destroySession(record.sessionId, "idle-timeout");
        }
      }
    }, SWEEP_INTERVAL_MS);
    sweeper.unref?.();
  }

  async function closeAll(): Promise<void> {
    await Promise.all(
      [...sessions.keys()].map((sessionId) =>
        destroySession(sessionId, "shutdown"),
      ),
    );

    // Await in-flight teardowns, bounded by a deadline so a socket stuck
    // half-open can never hang shutdown forever.
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    while (closures.size > 0 && Date.now() < deadline) {
      await Promise.race([
        Promise.all([...closures.values()]),
        new Promise((resolve) => setTimeout(resolve, 100).unref?.()),
      ]);
    }
  }

  return {
    activeSessionCount: () => sessions.size,
    pendingSessionCount: () => pending,
    listSessions: () =>
      [...sessions.values()].map((record) => ({
        sessionId: record.sessionId,
        kind: "streamable-http" as const,
        createdAt: new Date(record.createdAt).toISOString(),
        lastActivityAt: new Date(record.lastActivityAt).toISOString(),
        remoteAddress: record.remoteAddress,
        userAgent: record.userAgent,
      })),
    closeSession: (
      sessionId: string,
      reason: SessionCloseReason = "closed-by-operator",
    ) => destroySession(sessionId, reason),
    closeAll,
    dispose: async () => {
      if (sweeper) clearInterval(sweeper);
      sweeper = undefined;
      await closeAll();
    },
    handle,
  };
}
