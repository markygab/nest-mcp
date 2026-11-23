import "reflect-metadata";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Inject, Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Type } from "@sinclair/typebox";
import { once } from "node:events";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";

import {
  McpServerService,
  McpTool,
  McpTools,
  NestMcpModule,
  UseMcpGuards,
  UseMcpInterceptors,
  type McpExecutionContext,
  type McpInterceptor,
} from "./index.js";

function createFixture() {
  const events: string[] = [];
  const eventToken = Symbol("events");
  const interceptor = (name: string): McpInterceptor => ({
    async intercept(_context, next) {
      events.push(`${name}:enter`);
      try {
        return await next();
      } finally {
        events.push(`${name}:exit`);
      }
    },
  });

  @Injectable()
  class ServerInterceptor implements McpInterceptor {
    constructor(@Inject(eventToken) private readonly trace: string[]) {}

    async intercept(
      context: McpExecutionContext,
      next: () => Promise<unknown>,
    ) {
      this.trace.push(`server:${context.toolOptions.metadata?.weight ?? 1}`);
      if (context.toolOptions.metadata?.weight === 8) {
        throw new Error("Stopped by host interceptor");
      }
      return next();
    }
  }

  @McpTools("projects")
  @UseMcpInterceptors(interceptor("provider"))
  class Projects {
    @McpTool({
      description: "Read a project",
      inputSchema: Type.Object({ id: Type.String() }),
      metadata: { weight: 5 },
      name: "read_project",
    })
    @UseMcpGuards({
      canActivate(context) {
        events.push(`guard:${context.toolOptions.metadata?.weight}`);
        return context.requestContext.actorId === "test-user";
      },
    })
    @UseMcpInterceptors(interceptor("method"))
    read() {
      events.push("handler");
      return { ok: true };
    }

    @McpTool({
      description: "Archive a project",
      inputSchema: Type.Object({}),
      metadata: { weight: 8 },
      name: "archive_project",
    })
    archive() {
      events.push("unexpected handler");
    }
  }

  @McpTools("projects")
  class AdditionalTools {
    @McpTool({
      description: "List projects",
      inputSchema: Type.Object({}),
      name: "list_projects",
    })
    list() {
      return [];
    }
  }

  @McpTools("reports")
  class Reports {
    @McpTool({
      description: "Read a report",
      inputSchema: Type.Object({}),
      name: "read_report",
    })
    read() {
      return { ok: true };
    }
  }

  @Module({
    imports: [
      NestMcpModule.forRoot({
        serverInterceptors: {
          projects: [interceptor("outer"), ServerInterceptor],
        },
      }),
    ],
    providers: [
      { provide: eventToken, useValue: events },
      ServerInterceptor,
      Projects,
      AdditionalTools,
      Reports,
    ],
  })
  class TestModule {}

  return { events, TestModule };
}

const trace = [
  "guard:5",
  "outer:enter",
  "server:5",
  "provider:enter",
  "method:enter",
  "handler",
  "method:exit",
  "provider:exit",
  "outer:exit",
];
const context = { requestId: 1, actorId: "test-user" };
const input = { id: "example" };

describe("server interceptors", () => {
  it("wraps direct calls across a server, preserves validation and guard order, and isolates other servers", async () => {
    const { events, TestModule } = createFixture();
    const app = await NestFactory.createApplicationContext(TestModule, {
      abortOnError: false,
      logger: false,
    });

    try {
      const mcp = app.get(McpServerService);
      expect(mcp.listTools("projects")).toHaveLength(3);
      expect(
        mcp.listTools("projects").find((tool) => tool.name === "read_project"),
      ).not.toHaveProperty("metadata");

      await expect(
        mcp.callTool("projects", "read_project", input, context),
      ).resolves.toMatchObject({ structuredContent: { ok: true } });
      expect(events.splice(0)).toEqual(trace);

      await expect(
        mcp.callTool("projects", "read_project", {}, context),
      ).resolves.toMatchObject({ isError: true });
      expect(events).toEqual([]);

      await expect(
        mcp.callTool("projects", "read_project", input, { requestId: 1 }),
      ).resolves.toMatchObject({ isError: true });
      expect(events.splice(0)).toEqual(["guard:5"]);

      await expect(
        mcp.callTool("projects", "archive_project", {}, context),
      ).resolves.toMatchObject({
        content: [{ text: "Stopped by host interceptor" }],
        isError: true,
      });
      expect(events.splice(0)).toEqual(["outer:enter", "server:8", "outer:exit"]);

      await expect(
        mcp.callTool("projects", "list_projects", {}, context),
      ).resolves.toMatchObject({ content: [{ text: "[]" }] });
      expect(events.splice(0)).toEqual(["outer:enter", "server:1", "outer:exit"]);

      await expect(
        mcp.callTool("reports", "read_report", {}, context),
      ).resolves.toMatchObject({ structuredContent: { ok: true } });
      expect(events).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("runs the same chain over Streamable HTTP without exposing metadata to clients", async () => {
    const { events, TestModule } = createFixture();
    const app = await NestFactory.createApplicationContext(TestModule, {
      abortOnError: false,
      logger: false,
    });
    const mcp = app.get(McpServerService).createServer("projects", context);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => "test-session",
      enableJsonResponse: true,
    });
    const http = createServer((request, response) => {
      void transport.handleRequest(request, response).catch(() => {
        response.writeHead(500).end();
      });
    });
    const client = new Client({ name: "test-client", version: "1.0.0" });

    try {
      await mcp.connect(transport);
      http.listen(0, "127.0.0.1");
      await once(http, "listening");
      const address = http.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a loopback TCP address");
      }
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${address.port}/mcp`),
        ),
      );

      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        "archive_project",
        "list_projects",
        "read_project",
      ]);
      expect(tools.every((tool) => !("metadata" in tool))).toBe(true);
      expect(events).toEqual([]);

      await expect(
        client.callTool({ name: "read_project", arguments: input }),
      ).resolves.toMatchObject({ structuredContent: { ok: true } });
      expect(events.splice(0)).toEqual(trace);

      await expect(
        client.callTool({ name: "archive_project", arguments: {} }),
      ).resolves.toMatchObject({ isError: true });
      expect(events.splice(0)).toEqual(["outer:enter", "server:8", "outer:exit"]);
    } finally {
      await client.close();
      await mcp.close();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await app.close();
    }
  });
});
