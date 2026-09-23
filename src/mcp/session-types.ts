/**
 * Why a session was torn down. Left open-ended so internal call sites can
 * record a precise reason without widening a public union every time.
 */
export type SessionCloseReason =
  | "transport-closed"
  | "client-terminated"
  | "client-closed"
  | "stream-error"
  | "connect-failed"
  | "initialize-failed"
  | "keepalive-write-failed"
  | "idle-timeout"
  | "closed-by-operator"
  | "shutdown"
  | (string & {});

export type SessionKind = "streamable-http" | "sse";

/**
 * Lifecycle notice.
 *
 * Deliberately a flat shape rather than a discriminated union: a host consumer
 * writes every field into a log record, and a union would force a narrowing
 * branch per event type for no behavioural gain. The optional fields are
 * genuinely absent for some events — `session-rejected` fires before any id
 * exists.
 */
export interface McpSessionEvent {
  type:
    | "session-opened"
    | "session-closed"
    | "session-rejected"
    | "session-error";
  kind: SessionKind;
  sessionId?: string | undefined;
  reason?: string | undefined;
}

/** A public, serializable view of one live session. */
export interface McpSessionInfo {
  sessionId: string;
  kind: SessionKind;
  createdAt: string;
  lastActivityAt: string;
  remoteAddress?: string | undefined;
  userAgent?: string | undefined;
}
