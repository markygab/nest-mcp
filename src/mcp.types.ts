import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
  Tool,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import type { TObject, TSchema, Static } from "@sinclair/typebox";

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
  TInputSchema extends TObject = TObject,
  TOutputSchema extends TObject | undefined = TObject | undefined,
> = {
  annotations?: ToolAnnotations;
  description: string;
  inputSchema: TInputSchema;
  name: string;
  outputSchema?: TOutputSchema;
  title?: string;
};

export type McpParamKind = "args" | "context";

export type McpParamMetadata = {
  index: number;
  kind: McpParamKind;
};

export type McpDiscoveredTool = {
  annotations?: ToolAnnotations;
  description: string;
  handler: (...args: unknown[]) => Promise<unknown> | unknown;
  inputSchema: TObject;
  instance: object;
  methodName: string;
  name: string;
  outputSchema?: TObject;
  params: McpParamMetadata[];
  title?: string;
};

export type McpToolHandlerResult = CallToolResult;

export type McpToolDefinition = Tool;

export type McpToolArgs<TSchemaType extends TSchema> = Static<TSchemaType>;
