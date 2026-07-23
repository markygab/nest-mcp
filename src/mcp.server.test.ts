import { Type } from "@sinclair/typebox";
import { afterEach, describe, expect, it, vi } from "vitest";

import { McpServerService } from "./mcp.server.js";
import { McpInvoker } from "./mcp.invoker.js";
import { McpValidationService } from "./mcp.validation.js";

const tool = {
  description: "Example tool",
  guards: [],
  handler: vi.fn(),
  inputSchema: Type.Object({}),
  instance: {},
  methodName: "example",
  name: "example_tool",
  params: [],
};

const plainSchema = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["preview", "apply"] },
  },
  required: ["mode"],
} as const;

const plainOutputSchema = {
  type: "object",
  properties: {
    created: { type: "boolean" },
  },
  required: ["created"],
} as const;

const createService = (invoke: () => Promise<unknown>) =>
  new McpServerService(
    { create: vi.fn() } as never,
    { invoke } as never,
    { discoverTools: vi.fn().mockReturnValue([tool]) } as never,
    { validate: vi.fn() } as never,
  );

afterEach(() => {
  delete process.env.NEST_MCP_TOOL_RESPONSE_MAX_BYTES;
  delete process.env.NEST_MCP_TOOL_TIMEOUT_MS;
});

describe("McpServerService", () => {
  it("does not expose a tool outside the token allowlist", async () => {
    const service = createService(async () => ({ ok: true }));

    await expect(
      service.callTool(
        "example_mcp",
        "example_tool",
        {},
        {
          allowedToolNames: [],
          requestId: "request-1",
        },
      ),
    ).resolves.toMatchObject({ isError: true });
  });

  it("bounds tool execution by the configured timeout", async () => {
    process.env.NEST_MCP_TOOL_TIMEOUT_MS = "1";
    const service = createService(() => new Promise<never>(() => undefined));

    await expect(
      service.callTool(
        "example_mcp",
        "example_tool",
        {},
        { requestId: "request-1" },
      ),
    ).resolves.toMatchObject({ isError: true });
  });

  it("rejects oversized serialized tool results", async () => {
    process.env.NEST_MCP_TOOL_RESPONSE_MAX_BYTES = "10";
    const service = createService(async () => ({ value: "too large" }));

    await expect(
      service.callTool(
        "example_mcp",
        "example_tool",
        {},
        { requestId: "request-1" },
      ),
    ).resolves.toMatchObject({ isError: true });
  });

  it("returns the standard MCP error result when a guard denies invocation", async () => {
    const deniedHandler = vi.fn();
    const guardedTool = {
      ...tool,
      guards: [{ canActivate: () => false }],
      handler: deniedHandler,
    };
    const service = new McpServerService(
      { create: vi.fn() } as never,
      new McpInvoker(new McpValidationService()),
      { discoverTools: vi.fn().mockReturnValue([guardedTool]) } as never,
      new McpValidationService(),
    );

    await expect(
      service.callTool("example_mcp", "example_tool", {}, { requestId: "request-1" }),
    ).resolves.toMatchObject({
      content: [{ text: "MCP tool 'example_tool' invocation denied by guard" }],
      isError: true,
    });
    expect(deniedHandler).not.toHaveBeenCalled();
  });

  it("advertises a plain JSON Schema without translating it", () => {
    const service = new McpServerService(
      { create: vi.fn() } as never,
      { invoke: vi.fn() } as never,
      {
        discoverTools: vi.fn().mockReturnValue([
          {
            ...tool,
            inputSchema: plainSchema,
            outputSchema: plainOutputSchema,
          },
        ]),
      } as never,
      { validate: vi.fn() } as never,
    );

    expect(service.listTools("example_mcp")[0]?.inputSchema).toBe(plainSchema);
    expect(service.listTools("example_mcp")[0]?.outputSchema).toBe(
      plainOutputSchema,
    );
  });
});
