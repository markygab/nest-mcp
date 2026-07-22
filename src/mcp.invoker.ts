import { Inject, Injectable } from "@nestjs/common";

import type { McpDiscoveredTool, McpRequestContext } from "./mcp.types.js";
import { McpValidationService } from "./mcp.validation.js";

@Injectable()
export class McpInvoker {
  constructor(
    @Inject(McpValidationService)
    private readonly validation: McpValidationService,
  ) {}

  async invoke(
    tool: McpDiscoveredTool,
    rawArgs: unknown,
    context: McpRequestContext,
  ) {
    const validatedArgs = this.validation.validate(tool.inputSchema, rawArgs);
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

    return tool.handler(...args);
  }
}
