import { SetMetadata } from "@nestjs/common";
import type { TObject } from "@sinclair/typebox";

import {
  MCP_TOOL_METADATA,
  MCP_TOOL_PARAMS_METADATA,
  MCP_TOOLS_CLASS_METADATA,
  MCP_GUARDS_METADATA,
  MCP_INTERCEPTORS_METADATA,
} from "./mcp.constants.js";
import type {
  McpGuard,
  McpGuardReference,
  McpInterceptor,
  McpInterceptorReference,
  McpParamKind,
  McpParamMetadata,
  McpToolOptions,
} from "./mcp.types.js";

export const McpTools = (serverName: string): ClassDecorator =>
  SetMetadata(MCP_TOOLS_CLASS_METADATA, serverName);

export const McpTool = <
  TInputSchema extends TObject,
  TOutputSchema extends TObject | undefined = TObject | undefined,
>(
  options: McpToolOptions<TInputSchema, TOutputSchema>,
): MethodDecorator => SetMetadata(MCP_TOOL_METADATA, options);

/**
 * Attaches guards to an MCP tools provider or an individual tool method.
 * Provider guards run before method guards.
 */
export const UseMcpGuards = (
  ...guards: McpGuardReference[]
): ClassDecorator & MethodDecorator => SetMetadata(MCP_GUARDS_METADATA, guards);

/**
 * Attaches interceptors to an MCP tools provider or an individual tool method.
 * Provider interceptors wrap method interceptors.
 */
export const UseMcpInterceptors = (
  ...interceptors: McpInterceptorReference[]
): ClassDecorator & MethodDecorator =>
  SetMetadata(MCP_INTERCEPTORS_METADATA, interceptors);

const defineParamMetadata =
  (kind: McpParamKind): ParameterDecorator =>
  (target, propertyKey, parameterIndex) => {
    const existing: McpParamMetadata[] =
      Reflect.getMetadata(MCP_TOOL_PARAMS_METADATA, target, propertyKey!) ?? [];

    existing.push({ index: parameterIndex, kind });
    Reflect.defineMetadata(
      MCP_TOOL_PARAMS_METADATA,
      existing,
      target,
      propertyKey!,
    );
  };

export const McpArgs = () => defineParamMetadata("args");

export const McpContext = () => defineParamMetadata("context");
