import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";

import { McpInvoker } from "./mcp.invoker.js";
import type { McpDiscoveredTool, McpRequestContext } from "./mcp.types.js";
import { McpValidationService } from "./mcp.validation.js";

describe("McpInvoker", () => {
  it("validates input and injects args and context", async () => {
    const invoker = new McpInvoker(new McpValidationService());
    const context: McpRequestContext = {
      integration: {
        repo: "example/service-api",
      },
      requestId: "req-1",
    };
    const tool: McpDiscoveredTool = {
      description: "Echo input",
      handler: (
        input: { query: string },
        handlerContext: McpRequestContext,
      ) => ({
        query: input.query,
        requestId: handlerContext.requestId,
        repo: handlerContext.integration?.repo,
      }),
      inputSchema: Type.Object({
        query: Type.String(),
      }),
      instance: {},
      methodName: "echo",
      name: "echo",
      params: [
        { index: 0, kind: "args" },
        { index: 1, kind: "context" },
      ],
    };

    await expect(
      invoker.invoke(tool, { query: "security" }, context),
    ).resolves.toEqual({
      query: "security",
      repo: "example/service-api",
      requestId: "req-1",
    });
  });

  it("surfaces validation failures", async () => {
    const invoker = new McpInvoker(new McpValidationService());
    const tool: McpDiscoveredTool = {
      description: "Echo input",
      handler: () => ({ ok: true }),
      inputSchema: Type.Object({
        query: Type.String(),
      }),
      instance: {},
      methodName: "echo",
      name: "echo",
      params: [{ index: 0, kind: "args" }],
    };

    await expect(
      invoker.invoke(tool, { query: 42 }, { requestId: "req-1" }),
    ).rejects.toThrow(/should be string/u);
  });
});
