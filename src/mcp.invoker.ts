import { Inject, Injectable } from "@nestjs/common";

import type {
  McpDiscoveredTool,
  McpExecutionContext,
  McpRequestContext,
} from "./mcp.types.js";
import { McpValidationService } from "./mcp.validation.js";

@Injectable()
export class McpInvoker {
  constructor(
    @Inject(McpValidationService)
    private readonly validation: McpValidationService,
  ) {}

  async invoke(
    serverName: string,
    tool: McpDiscoveredTool,
    rawArgs: unknown,
    context: McpRequestContext,
  ) {
    const validatedArgs = this.validation.validate(tool.inputSchema, rawArgs);
    const guardContext: McpExecutionContext = {
      methodName: tool.methodName,
      requestContext: context,
      serverName,
      toolName: tool.name,
      toolOptions: {
        annotations: tool.annotations,
        description: tool.description,
        inputSchema: tool.inputSchema,
        name: tool.name,
        outputSchema: tool.outputSchema,
        title: tool.title,
      },
      validatedArgs,
    };

    for (const guard of tool.guards ?? []) {
      if (!(await guard.canActivate(guardContext))) {
        throw new Error(`MCP tool '${tool.name}' invocation denied by guard`);
      }
    }

    const args: unknown[] = [];

    for (const param of tool.params) {
      if (param.kind === "args") {
        args[param.index] = validatedArgs;
        continue;
      }

      if (param.kind === "context") {
        args[param.index] = context;
      }
    }

    const handler = async () => tool.handler(...args);
    const invocation = (tool.interceptors ?? []).reduceRight<
      () => Promise<unknown>
    >(
      (next, interceptor) => () => interceptor.intercept(guardContext, next),
      handler,
    );

    return invocation();
  }
}
