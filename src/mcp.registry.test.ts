import "reflect-metadata";

import { MetadataScanner, Reflector } from "@nestjs/core";
import { Type } from "@sinclair/typebox";
import { describe, expect, it, vi } from "vitest";

import {
  McpArgs,
  McpContext,
  McpTool,
  McpTools,
  UseMcpGuards,
  UseMcpInterceptors,
} from "./mcp.decorators.js";
import { McpRegistry } from "./mcp.registry.js";
import type { McpGuard, McpInterceptor } from "./mcp.types.js";

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

const classGuard = { canActivate: () => true };
const methodGuard = { canActivate: () => true };
class ProviderGuard implements McpGuard {
  canActivate() {
    return true;
  }
}
const providerGuard = new ProviderGuard();
const classInterceptor = { intercept: async (_context: object, next: () => Promise<unknown>) => next() };
const methodInterceptor = { intercept: async (_context: object, next: () => Promise<unknown>) => next() };
class ProviderInterceptor implements McpInterceptor {
  async intercept(_context: object, next: () => Promise<unknown>) {
    return next();
  }
}
const providerInterceptor = new ProviderInterceptor();

@McpTools("guarded_mcp")
@UseMcpGuards(classGuard)
@UseMcpInterceptors(classInterceptor)
class GuardedMcpTools {
  @McpTool({
    description: "Run a guarded tool",
    inputSchema: Type.Object({}),
    name: "guarded_tool",
  })
  @UseMcpGuards(methodGuard, ProviderGuard)
  @UseMcpInterceptors(methodInterceptor, ProviderInterceptor)
  guardedTool() {
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
      { get: () => undefined } as never,
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
      { get: () => undefined } as never,
    );

    expect(registry.discoverTools("jira_mcp")).toEqual([]);
    expect(registry.discoverTools("other_mcp")).toMatchObject([
      { name: "list_other_tasks" },
    ]);
  });

  it("collects class and method guard and interceptor metadata independently", () => {
    const moduleRef = {
      get: vi.fn((token) => {
        if (token === ProviderGuard) {
          return providerGuard;
        }

        if (token === ProviderInterceptor) {
          return providerInterceptor;
        }

        return undefined;
      }),
    };
    const registry = new McpRegistry(
      {
        getProviders: () => [
          {
            instance: new GuardedMcpTools(),
            metatype: GuardedMcpTools,
          },
        ],
      } as never,
      new MetadataScanner(),
      new Reflector(),
      moduleRef as never,
    );

    const [tool] = registry.discoverTools("guarded_mcp");

    expect(tool?.guards).toEqual([
      classGuard,
      methodGuard,
      providerGuard,
    ]);
    expect(moduleRef.get).toHaveBeenCalledWith(ProviderGuard, { strict: false });
    expect(tool?.interceptors).toEqual([
      classInterceptor,
      methodInterceptor,
      providerInterceptor,
    ]);
    expect(moduleRef.get).toHaveBeenCalledWith(ProviderInterceptor, {
      strict: false,
    });
  });
});
