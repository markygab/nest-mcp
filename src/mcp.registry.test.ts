import "reflect-metadata";

import { MetadataScanner, Reflector } from "@nestjs/core";
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";

import { McpArgs, McpContext, McpTool, McpTools } from "./mcp.decorators.js";
import { McpRegistry } from "./mcp.registry.js";

@McpTools("example_mcp")
class ExampleMcpTools {
  @McpTool({
    description: "List example tasks",
    inputSchema: Type.Object({
      query: Type.String(),
    }),
    name: "list_tasks",
  })
  listTasks(
    @McpArgs() input: { query: string },
    @McpContext() context: object,
  ) {
    return { context, input };
  }
}

class PlainProvider {
  noop() {
    return "noop";
  }
}

@McpTools("other_mcp")
class OtherMcpTools {
  @McpTool({
    description: "List other tasks",
    inputSchema: Type.Object({}),
    name: "list_other_tasks",
  })
  listOtherTasks() {
    return {};
  }
}

describe("McpRegistry", () => {
  it("discovers decorated tool providers and parameter metadata", () => {
    const registry = new McpRegistry(
      {
        getProviders: () => [
          {
            instance: new ExampleMcpTools(),
            metatype: ExampleMcpTools,
          },
          {
            instance: new PlainProvider(),
            metatype: PlainProvider,
          },
          {
            instance: new OtherMcpTools(),
            metatype: OtherMcpTools,
          },
        ],
      } as never,
      new MetadataScanner(),
      new Reflector(),
    );

    const tools = registry.discoverTools("example_mcp");

    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("list_tasks");
    expect(tools[0]?.params).toEqual([
      { index: 0, kind: "args" },
      { index: 1, kind: "context" },
    ]);
  });

  it("isolates tools by MCP server name", () => {
    const registry = new McpRegistry(
      {
        getProviders: () => [
          {
            instance: new ExampleMcpTools(),
            metatype: ExampleMcpTools,
          },
          {
            instance: new OtherMcpTools(),
            metatype: OtherMcpTools,
          },
        ],
      } as never,
      new MetadataScanner(),
      new Reflector(),
    );

    expect(registry.discoverTools("jira_mcp")).toEqual([]);
    expect(registry.discoverTools("other_mcp")).toMatchObject([
      { name: "list_other_tasks" },
    ]);
  });
});
