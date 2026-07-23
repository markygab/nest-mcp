import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
  Tool,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import type { TSchema, Static } from "@sinclair/typebox";
import type { Type as NestType } from "@nestjs/common";

export type McpRequestContext = {
  allowedToolNames?: string[];
  actorId?: string;
  authInfo?: AuthInfo;
  integration?: {
    issueKey?: string;
    pullRequestNumber?: string;
    repo?: string;
  };
  organisationId?: string;
  raw?: unknown;
  requestId: string | number;
  requestInfo?: RequestHandlerExtra<
    ServerRequest,
    ServerNotification
  >["requestInfo"];
  sessionId?: string;
  tenantId?: string;
  workflowId?: string;
};

export type McpToolOptions<
  TInputSchema extends McpJsonSchema = McpJsonSchema,
  TOutputSchema extends McpJsonSchema | undefined = McpJsonSchema | undefined,
> = {
  annotations?: ToolAnnotations;
  description: string;
  inputSchema: TInputSchema;
  name: string;
  outputSchema?: TOutputSchema;
  title?: string;
};

/**
 * A JSON Schema document accepted by MCP tools.
 *
 * TypeBox schemas remain supported because they extend `TSchema`; plain JSON
 * Schema objects may use any standard or application-defined keyword.
 */
export type McpJsonSchema = TSchema | Record<string, unknown>;

/**
 * Context supplied to MCP guards and interceptors after a tool's input has
 * been validated.
 */
export type McpExecutionContext = {
  /** The name assigned by {@link McpTools}. */
  serverName: string;
  /** The public MCP tool name. */
  toolName: string;
  /** The TypeBox-validated arguments that will be passed to the handler. */
  validatedArgs: unknown;
  /** Trusted request data supplied by the host application. */
  requestContext: McpRequestContext;
  /** The decorated method name on the MCP tools provider. */
  methodName: string;
  /** The metadata declared with {@link McpTool}. */
  toolOptions: McpToolOptions;
};

/**
 * A policy hook that decides whether an MCP tool invocation may proceed.
 */
export interface McpGuard {
  canActivate(context: McpExecutionContext): boolean | Promise<boolean>;
}

/** A guard instance or an injectable Nest provider class implementing it. */
export type McpGuardReference = McpGuard | NestType<McpGuard>;

/**
 * A hook that wraps a permitted MCP tool invocation.
 */
export interface McpInterceptor {
  intercept(
    context: McpExecutionContext,
    next: () => Promise<unknown>,
  ): Promise<unknown>;
}

/** An interceptor instance or an injectable Nest provider class implementing it. */
export type McpInterceptorReference =
  | McpInterceptor
  | NestType<McpInterceptor>;

export type McpParamKind = "args" | "context";

export type McpParamMetadata = {
  index: number;
  kind: McpParamKind;
};

export type McpDiscoveredTool = {
  annotations?: ToolAnnotations;
  description: string;
  guards?: McpGuard[];
  interceptors?: McpInterceptor[];
  handler: (...args: unknown[]) => Promise<unknown> | unknown;
  inputSchema: McpJsonSchema;
  instance: object;
  methodName: string;
  name: string;
  outputSchema?: McpJsonSchema;
  params: McpParamMetadata[];
  title?: string;
};

export type McpToolHandlerResult = CallToolResult;

export type McpToolDefinition = Tool;

/**
 * Infers TypeBox schemas and otherwise uses the caller-supplied value type.
 */
export type McpToolArgs<TSchemaType, TValue = unknown> =
  TSchemaType extends TSchema ? Static<TSchemaType> : TValue;
