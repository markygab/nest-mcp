import { Type } from "@sinclair/typebox";
import { afterEach, describe, expect, it, vi } from "vitest";

import { McpServerService } from "./mcp.server.js";

const tool = {
  description: "Example tool",
  handler: vi.fn(),
  inputSchema: Type.Object({}),
  instance: {},
  methodName: "example",
  name: "example_tool",
  params: [],
};

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
});
