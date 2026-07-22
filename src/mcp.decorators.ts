import { SetMetadata } from "@nestjs/common";
import type { TObject } from "@sinclair/typebox";

import {
  MCP_TOOL_METADATA,
  MCP_TOOL_PARAMS_METADATA,
  MCP_TOOLS_CLASS_METADATA,
} from "./mcp.constants.js";
import type {
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
