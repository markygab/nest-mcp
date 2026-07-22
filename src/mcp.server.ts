import { Inject, Injectable, Logger } from "@nestjs/common";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { McpContextFactory } from "./mcp.context.js";
import {
  assertMcpResponseSize,
  withMcpToolTimeout,
} from "./mcp.execution-guard.js";
import { McpInvoker } from "./mcp.invoker.js";
import { McpRegistry } from "./mcp.registry.js";
import type {
  McpDiscoveredTool,
  McpRequestContext,
  McpToolDefinition,
} from "./mcp.types.js";
import { McpValidationService } from "./mcp.validation.js";

type McpServerInstance = {
  server: Server;
  tools: Map<string, McpDiscoveredTool>;
};

@Injectable()
export class McpServerService {
  private readonly logger = new Logger(McpServerService.name);
  private readonly servers = new Map<string, McpServerInstance>();

  constructor(
    @Inject(McpContextFactory)
    private readonly contextFactory: McpContextFactory,
    @Inject(McpInvoker)
    private readonly invoker: McpInvoker,
    @Inject(McpRegistry)
    private readonly registry: McpRegistry,
    @Inject(McpValidationService)
    private readonly validation: McpValidationService,
  ) {}

  async callTool(
    serverName: string,
    name: string,
    args: unknown,
    context: McpRequestContext,
  ): Promise<CallToolResult> {
    return this.callToolFromTools(
      serverName,
      this.filterTools(this.getInstance(serverName).tools, context),
      name,
      args,
      context,
    );
  }

  private async callToolFromTools(
    serverName: string,
    tools: Map<string, McpDiscoveredTool>,
    name: string,
    args: unknown,
    context: McpRequestContext,
  ): Promise<CallToolResult> {
    const tool = tools.get(name);

    if (!tool) {
      return this.createToolError(`Unknown MCP tool '${name}'`);
    }

    try {
      const startedAt = Date.now();
      const result = await withMcpToolTimeout(
        this.invoker.invoke(serverName, tool, args, context),
      );

      if (tool.outputSchema) {
        this.validation.validate(tool.outputSchema, result);
      }

      const response = this.toCallToolResult(result);
      assertMcpResponseSize(response);
      this.logger.log(
        JSON.stringify({
          event: "mcp.tool.completed",
          latencyMs: Date.now() - startedAt,
          serverName:
            context.requestInfo?.headers?.["x-mcp-server"] ?? undefined,
          toolName: name,
        }),
      );
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        JSON.stringify({ event: "mcp.tool.failed", toolName: name, message }),
      );

      return this.createToolError(message);
    }
  }

  connect(serverName: string, transport: Transport) {
    return this.getInstance(serverName).server.connect(transport);
  }

  createServer(
    serverName: string,
    contextOverrides?: Partial<McpRequestContext>,
  ) {
    return this.createInstance(serverName, contextOverrides).server;
  }

  getServer(serverName: string) {
    return this.getInstance(serverName).server;
  }

  listTools(serverName: string): McpToolDefinition[] {
    return [...this.getInstance(serverName).tools.values()].map((tool) =>
      this.toToolDefinition(tool),
    );
  }

  async startStdio(serverName: string) {
    const transport = new StdioServerTransport();

    await this.connect(serverName, transport);
  }

  private createToolError(message: string): CallToolResult {
    return {
      content: [
        {
          text: message,
          type: "text",
        },
      ],
      isError: true,
    };
  }

  private getInstance(serverName: string): McpServerInstance {
    const existing = this.servers.get(serverName);

    if (existing) {
      return existing;
    }

    const instance = this.createInstance(serverName);

    this.servers.set(serverName, instance);

    return instance;
  }

  private createInstance(
    serverName: string,
    contextOverrides?: Partial<McpRequestContext>,
  ): McpServerInstance {
    const tools = new Map<string, McpDiscoveredTool>();

    for (const tool of this.registry.discoverTools(serverName)) {
      if (tools.has(tool.name)) {
        throw new Error(
          `Duplicate MCP tool name '${tool.name}' in ${serverName}`,
        );
      }

      tools.set(tool.name, tool);
    }

    const server = new Server(
      { name: `nest-mcp-${serverName}`, version: "0.1.0" },
      { capabilities: { tools: { listChanged: true } } },
    );
    const instance = { server, tools };

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [...this.filterTools(tools, contextOverrides).values()].map(
        (tool) => this.toToolDefinition(tool),
      ),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const context = this.contextFactory.create(extra, contextOverrides);

      return this.callToolFromTools(
        serverName,
        this.filterTools(tools, context),
        request.params.name,
        request.params.arguments ?? {},
        context,
      );
    });

    return instance;
  }

  private toCallToolResult(result: unknown): CallToolResult {
    if (
      typeof result === "object" &&
      result !== null &&
      !Array.isArray(result)
    ) {
      return {
        content: [
          {
            text: JSON.stringify(result, null, 2),
            type: "text",
          },
        ],
        structuredContent: result as Record<string, unknown>,
      };
    }

    return {
      content: [
        {
          text: JSON.stringify(result),
          type: "text",
        },
      ],
    };
  }

  private filterTools(
    tools: Map<string, McpDiscoveredTool>,
    context?: Partial<McpRequestContext>,
  ) {
    if (!context?.allowedToolNames) {
      return tools;
    }

    const allowed = new Set(context.allowedToolNames);

    return new Map([...tools].filter(([name]) => allowed.has(name)));
  }

  private toToolDefinition(tool: McpDiscoveredTool): Tool {
    return {
      annotations: tool.annotations,
      description: tool.description,
      inputSchema: tool.inputSchema as Tool["inputSchema"],
      name: tool.name,
      outputSchema: tool.outputSchema as Tool["outputSchema"],
      title: tool.title,
    };
  }
}
