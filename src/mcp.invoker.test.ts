import { Type } from "@sinclair/typebox";
import { describe, expect, it, vi } from "vitest";

import { McpInvoker } from "./mcp.invoker.js";
import type {
  McpDiscoveredTool,
  McpRequestContext,
  McpToolArgs,
} from "./mcp.types.js";
import { McpValidationService } from "./mcp.validation.js";

const PlainInputSchema = {
  type: "object",
  properties: {
    details: {
      type: "object",
      properties: {
        title: { type: "string" },
      },
      required: ["title"],
    },
    state: { type: "string", enum: ["draft", "published"] },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["details", "state", "tags"],
} as const;

type PlainInput = {
  details: { title: string };
  state: "draft" | "published";
  tags: string[];
};

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
      guards: [],
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
      invoker.invoke("example_mcp", tool, { query: "security" }, context),
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
      guards: [],
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
      invoker.invoke("example_mcp", tool, { query: 42 }, { requestId: "req-1" }),
    ).rejects.toThrow(/should be string/u);
  });

  it("validates plain JSON Schema input before invoking the handler", async () => {
    const invoker = new McpInvoker(new McpValidationService());
    const handler = vi.fn((input: McpToolArgs<typeof PlainInputSchema, PlainInput>) => input);
    const tool: McpDiscoveredTool = {
      description: "Plain JSON Schema tool",
      handler,
      inputSchema: PlainInputSchema,
      instance: {},
      methodName: "plainSchema",
      name: "plain_schema",
      params: [{ index: 0, kind: "args" }],
    };
    const validInput: PlainInput = {
      details: { title: "Example" },
      state: "draft",
      tags: ["mcp"],
    };

    await expect(
      invoker.invoke("example_mcp", tool, validInput, { requestId: "req-1" }),
    ).resolves.toEqual(validInput);
    expect(handler).toHaveBeenCalledWith(validInput);

    await expect(
      invoker.invoke(
        "example_mcp",
        tool,
        { details: { title: "Example" }, state: "invalid", tags: [] },
        { requestId: "req-1" },
      ),
    ).rejects.toThrow(/should be equal to one of the allowed values/u);
    await expect(
      invoker.invoke(
        "example_mcp",
        tool,
        { state: "draft", tags: [] },
        { requestId: "req-1" },
      ),
    ).rejects.toThrow(/should have required property 'details'/u);
  });

  it("validates JSON Schema composition and local $defs references", () => {
    const validation = new McpValidationService();
    const schema = {
      allOf: [
        {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        {
          type: "object",
          properties: { status: { $ref: "#/$defs/status" } },
          required: ["status"],
        },
      ],
      $defs: {
        status: { enum: ["open", "closed"] },
      },
    };

    expect(validation.validate(schema, { id: "task-1", status: "open" })).toEqual({
      id: "task-1",
      status: "open",
    });
    expect(() => validation.validate(schema, { id: "task-1", status: "pending" })).toThrow(
      /should be equal to one of the allowed values/u,
    );
  });

  it("runs guards in order with validated arguments before invoking the handler", async () => {
    const invoker = new McpInvoker(new McpValidationService());
    const calls: string[] = [];
    const handler = vi.fn(() => ({ ok: true }));
    const tool: McpDiscoveredTool = {
      description: "Guarded tool",
      guards: [
        {
          canActivate: (context) => {
            calls.push(`class:${context.validatedArgs instanceof Object}`);
            expect(context).toMatchObject({
              requestContext: { requestId: "req-1" },
              serverName: "example_mcp",
              toolName: "guarded_tool",
              validatedArgs: { query: "security" },
            });
            return true;
          },
        },
        {
          canActivate: () => {
            calls.push("method");
            return true;
          },
        },
      ],
      handler,
      inputSchema: Type.Object({ query: Type.String() }),
      instance: {},
      methodName: "guardedTool",
      name: "guarded_tool",
      params: [{ index: 0, kind: "args" }],
    };

    await expect(
      invoker.invoke("example_mcp", tool, { query: "security" }, { requestId: "req-1" }),
    ).resolves.toEqual({ ok: true });

    expect(calls).toEqual(["class:true", "method"]);
    expect(handler).toHaveBeenCalledWith({ query: "security" });
  });

  it("does not invoke a handler when a guard denies access", async () => {
    const invoker = new McpInvoker(new McpValidationService());
    const handler = vi.fn();
    const tool: McpDiscoveredTool = {
      description: "Denied tool",
      guards: [{ canActivate: () => false }],
      handler,
      inputSchema: Type.Object({}),
      instance: {},
      methodName: "denied",
      name: "denied_tool",
      params: [],
    };

    await expect(
      invoker.invoke("example_mcp", tool, {}, { requestId: "req-1" }),
    ).rejects.toThrow("MCP tool 'denied_tool' invocation denied by guard");
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs a class interceptor around a tool handler with validated context", async () => {
    const invoker = new McpInvoker(new McpValidationService());
    const calls: string[] = [];
    const tool: McpDiscoveredTool = {
      description: "Class-intercepted tool",
      handler: () => {
        calls.push("handler");
        return { ok: true };
      },
      inputSchema: Type.Object({ query: Type.String() }),
      instance: {},
      interceptors: [
        {
          intercept: async (context, next) => {
            expect(context.validatedArgs).toEqual({ query: "security" });
            expect(context.requestContext.requestId).toBe("req-1");
            calls.push("class:enter");
            const result = await next();
            calls.push("class:exit");
            return result;
          },
        },
      ],
      methodName: "classIntercepted",
      name: "class_intercepted",
      params: [],
    };

    await invoker.invoke("example_mcp", tool, { query: "security" }, { requestId: "req-1" });

    expect(calls).toEqual(["class:enter", "handler", "class:exit"]);
  });

  it("runs a method interceptor around a tool handler", async () => {
    const invoker = new McpInvoker(new McpValidationService());
    const calls: string[] = [];
    const tool: McpDiscoveredTool = {
      description: "Method-intercepted tool",
      handler: () => {
        calls.push("handler");
        return { ok: true };
      },
      inputSchema: Type.Object({}),
      instance: {},
      interceptors: [
        {
          intercept: async (_context, next) => {
            calls.push("method:enter");
            const result = await next();
            calls.push("method:exit");
            return result;
          },
        },
      ],
      methodName: "methodIntercepted",
      name: "method_intercepted",
      params: [],
    };

    await invoker.invoke("example_mcp", tool, {}, { requestId: "req-1" });

    expect(calls).toEqual(["method:enter", "handler", "method:exit"]);
  });

  it("composes interceptors in Nest order and allows result transformation", async () => {
    const invoker = new McpInvoker(new McpValidationService());
    const calls: string[] = [];
    const interceptor = (name: string, transform = false) => ({
      intercept: async (_context: unknown, next: () => Promise<unknown>) => {
        calls.push(`${name}:enter`);
        const result = await next();
        calls.push(`${name}:exit`);
        return transform ? { wrapped: result } : result;
      },
    });
    const tool: McpDiscoveredTool = {
      description: "Combined tool",
      handler: () => {
        calls.push("handler");
        return { ok: true };
      },
      inputSchema: Type.Object({}),
      instance: {},
      interceptors: [
        interceptor("class-one"),
        interceptor("class-two"),
        interceptor("method-one", true),
        interceptor("method-two"),
      ],
      methodName: "combined",
      name: "combined",
      params: [],
    };

    await expect(
      invoker.invoke("example_mcp", tool, {}, { requestId: "req-1" }),
    ).resolves.toEqual({ wrapped: { ok: true } });
    expect(calls).toEqual([
      "class-one:enter",
      "class-two:enter",
      "method-one:enter",
      "method-two:enter",
      "handler",
      "method-two:exit",
      "method-one:exit",
      "class-two:exit",
      "class-one:exit",
    ]);
  });

  it("propagates interceptor errors without invoking the handler", async () => {
    const invoker = new McpInvoker(new McpValidationService());
    const handler = vi.fn();
    const tool: McpDiscoveredTool = {
      description: "Failing intercepted tool",
      handler,
      inputSchema: Type.Object({}),
      instance: {},
      interceptors: [
        {
          intercept: async () => {
            throw new Error("interceptor failure");
          },
        },
      ],
      methodName: "failing",
      name: "failing",
      params: [],
    };

    await expect(
      invoker.invoke("example_mcp", tool, {}, { requestId: "req-1" }),
    ).rejects.toThrow("interceptor failure");
    expect(handler).not.toHaveBeenCalled();
  });
});
