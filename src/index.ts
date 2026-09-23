export { loadOpenApiSpec, parseSpecContent } from "./core/openapi-loader";

export {
  generateTools,
  generateToolsDetailed,
  buildBindingIndex,
} from "./core/tool-generator";
export type {
  ToolBinding,
  GeneratedTool as GeneratedToolWithBinding,
} from "./core/tool-generator";

export { generatePrompts, resolvePrompt } from "./registry/prompt-registry";
export { generateResources, readResource } from "./registry/resource-registry";
export { executeToolCall } from "./core/http-executor";

export {
  iterateOperations,
  collectOperationParameters,
  normalizeParameter,
  synthesizeOperationId,
  ensureUniqueName,
  extractPathTemplateVariables,
  effectiveStyle,
  effectiveExplode,
  findOperationById,
  findDuplicateOperationIds,
  assertUniqueOperationIds,
  isPlainObject,
  truncateGeneratedName,
} from "./core/spec-utils";
export type {
  OperationEntry,
  DuplicateOperationId,
} from "./core/spec-utils";

export { buildRequest } from "./core/request-builder";

export { buildMcpServer } from "./mcp/create-server";
export type { SpecProvider, ContextProvider } from "./mcp/create-server";
export { startStdioServer } from "./mcp/transport-stdio";
export { attachSseRoutes, attachMcpRoutes } from "./mcp/transport-http";
export type {
  McpRouteHandle,
  AttachMcpRoutesOptions,
} from "./mcp/transport-http";
export { createStreamableSessionHost } from "./mcp/session-host";
export type {
  StreamableSessionHost,
  StreamableSessionHostOptions,
} from "./mcp/session-host";
export type {
  McpSessionEvent,
  McpSessionInfo,
  SessionCloseReason,
  SessionKind,
} from "./mcp/session-types";

export { startAdminServer } from "./server/admin-server";
export { createAuthMiddleware } from "./server/auth";

export { isAbortError, newId } from "./core/global-utils";
export { ServiceRegistry } from "./runtime/service-registry";

export type * from "./types";
