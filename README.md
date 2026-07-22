# @markygab/nest-mcp

Internal NestJS primitives for defining and serving Model Context Protocol (MCP)
tools. The package provides decorator-based tool discovery, TypeBox/AJV input
and output validation, explicit parameter injection, and MCP SDK server
construction.

It deliberately does not include HTTP routing, authentication, authorization,
tenant policy, or application-specific context. Each host application supplies
those concerns at its own boundary.

## Install and register

Add the workspace package as a dependency, then import `NestMcpModule` once in
the application's root module or a module visible to all MCP tool providers.

```ts
import { Module } from "@nestjs/common";
import { NestMcpModule } from "@markygab/nest-mcp";

import { ProjectsModule } from "./projects/projects.module.js";

@Module({
  imports: [NestMcpModule, ProjectsModule],
})
export class AppModule {}
```

The package uses Nest's `DiscoveryService` to find decorated providers across
the application container. Tool classes must still be registered as normal
Nest providers in their feature modules.

## Define a tool

Use TypeBox schemas for inputs and, where practical, outputs. `@McpTools()`
assigns the provider to one named MCP server. `@McpTool()` declares a single
tool, while `@McpArgs()` and `@McpContext()` make handler injection explicit.

```ts
import { Inject, Injectable } from "@nestjs/common";
import {
  McpArgs,
  McpContext,
  McpTool,
  McpTools,
  type McpRequestContext,
  type McpToolArgs,
} from "@markygab/nest-mcp";
import { Type } from "@sinclair/typebox";

import { ProjectsQueryService } from "./projects-query.service.js";

const GetProjectInput = Type.Object({
  id: Type.String({ minLength: 1 }),
});
const GetProjectOutput = Type.Object({
  project: Type.Union([
    Type.Object({ id: Type.String(), name: Type.String() }),
    Type.Null(),
  ]),
});

type GetProjectInput = McpToolArgs<typeof GetProjectInput>;

@Injectable()
@McpTools("projects_mcp")
export class ProjectsMcp {
  constructor(
    @Inject(ProjectsQueryService)
    private readonly projects: ProjectsQueryService,
  ) {}

  @McpTool({
    name: "projects_get",
    title: "Get project",
    description: "Get a project visible to the current caller.",
    inputSchema: GetProjectInput,
    outputSchema: GetProjectOutput,
  })
  async getProject(
    @McpArgs() input: GetProjectInput,
    @McpContext() context: McpRequestContext,
  ) {
    return {
      project: await this.projects.getVisibleTo(context.actorId, input.id),
    };
  }
}
```

Tool names must be unique within a named server. Keep handlers thin: enforce
application policy and call existing domain services rather than placing
vendor-client or persistence logic in MCP classes.

## Guard tool invocations

`@UseMcpGuards()` attaches policy-agnostic guards to a tools class or an
individual tool. Guards run after the input schema is validated and before the
handler. Class guards run first, followed by method guards. Return `false` or
throw to prevent invocation; the caller receives the normal MCP tool error
response. Pass either a guard instance or an injectable Nest provider class;
provider classes are resolved from the application container.

```ts
import { Injectable } from "@nestjs/common";
import {
  McpArgs,
  McpTool,
  McpTools,
  UseMcpGuards,
  type McpExecutionContext,
  type McpGuard,
} from "@markygab/nest-mcp";

const auditGuard: McpGuard = {
  canActivate(context: McpExecutionContext) {
    // validatedArgs, serverName, toolName, requestContext, and toolOptions
    // are available here. Application policy remains outside this library.
    return true;
  },
};

@Injectable()
class ProjectsAccessGuard implements McpGuard {
  canActivate(context: McpExecutionContext) {
    return Boolean(context.requestContext.actorId);
  }
}

@McpTools("projects_mcp")
@UseMcpGuards(auditGuard, ProjectsAccessGuard)
class ProjectsMcp {
  @McpTool({ name: "projects_get", description: "Get a project", inputSchema: GetProjectInput })
  @UseMcpGuards({ canActivate: () => true })
  getProject(@McpArgs() input: GetProjectInput) {
    return { project: input.id };
  }
}
```

## Intercept tool invocations

`@UseMcpInterceptors()` wraps a permitted tool invocation. It accepts
`McpInterceptor` objects or injectable Nest provider classes and may be applied
to a tools class or a single tool. Provider classes are resolved from the
application container.
Interceptors receive the same `McpExecutionContext` as guards, including the
validated arguments and trusted request context. Class interceptors enter in
declaration order, then method interceptors; they unwind in reverse order.
Thrown errors propagate to the standard MCP tool error response.

```ts
import { Injectable } from "@nestjs/common";
import {
  UseMcpInterceptors,
  type McpExecutionContext,
  type McpInterceptor,
} from "@markygab/nest-mcp";

@Injectable()
class TimingInterceptor implements McpInterceptor {
  async intercept(context: McpExecutionContext, next) {
    const startedAt = Date.now();

    try {
      return await next();
    } finally {
      // Hosts decide whether and where to record this information.
      console.log(context.toolName, Date.now() - startedAt);
    }
  }
}

@UseMcpInterceptors(TimingInterceptor)
class ProjectsMcp {
  // @UseMcpInterceptors(...) can also be applied to an @McpTool() method.
}
```

## Request context and policy

`McpRequestContext` contains common request identifiers, optional actor and
tenant fields, an optional `integration` object, and `allowedToolNames`.
Applications can add their own fields when creating the context.

When a request context contains `allowedToolNames`, the package hides every
other tool from both `tools/list` and `tools/call`. Authentication and
authorization should run before the MCP request reaches the package; build the
trusted context from the verified principal and route parameters, never from
model-provided tool arguments.

## Serve over HTTP

The host owns the controller, authentication, and request-context mapping. Add
a controller and transport service to the application that imports
`NestMcpModule`; the example below exposes `POST`, `GET`, and `DELETE` requests
at `/mcp/projects_mcp`, as required by Streamable HTTP clients.

```ts
import {
  All,
  Controller,
  Inject,
  Injectable,
  Module,
  Param,
  Req,
  Res,
} from "@nestjs/common";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServerService, type McpRequestContext } from "@markygab/nest-mcp";
import type { Request, Response } from "express";

@Injectable()
export class ProjectsMcpHttpService {
  constructor(
    @Inject(McpServerService)
    private readonly mcpServer: McpServerService,
  ) {}

  async handle(
    serverName: string,
    request: Request,
    response: Response,
    context: McpRequestContext,
  ) {
    const transport = new StreamableHTTPServerTransport({
      // Use stateless requests when the host does not persist MCP sessions.
      sessionIdGenerator: undefined,
    });
    const server = this.mcpServer.createServer(serverName, context);

    await server.connect(transport);

    try {
      await transport.handleRequest(request, response, request.body);
    } finally {
      await transport.close();
    }
  }
}

@Controller("mcp")
export class ProjectsMcpHttpController {
  constructor(
    @Inject(ProjectsMcpAuthService)
    private readonly auth: ProjectsMcpAuthService,
    @Inject(ProjectsMcpHttpService)
    private readonly http: ProjectsMcpHttpService,
  ) {}

  @All(":serverName")
  async handle(
    @Param("serverName") serverName: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const context = this.auth.verifyAuthorization(
      request.header("authorization"),
      serverName,
    );

    await this.http.handle(serverName, request, response, context);
  }
}
```

Register these host-side providers alongside the shared module:

```ts
@Module({
  imports: [NestMcpModule],
  controllers: [ProjectsMcpHttpController],
  providers: [ProjectsMcpAuthService, ProjectsMcpHttpService],
})
export class ProjectsMcpModule {}
```

`ProjectsMcpAuthService` should verify the bearer token and return only trusted
context, for example `{ requestId, actorId, tenantId, allowedToolNames }`.
Bind the token to `serverName` so a credential issued for `projects_mcp` cannot
be reused against another named server. If you use stateful MCP sessions,
replace the stateless transport configuration with a host-managed session ID
strategy and retain the corresponding transport for later requests.

The host application owns the corresponding controller, authentication
service, and transport service.

## Runtime limits

Set these optional environment variables in the host process to bound tool
execution and serialized responses:

- `NEST_MCP_TOOL_TIMEOUT_MS` defaults to `15000`.
- `NEST_MCP_TOOL_RESPONSE_MAX_BYTES` defaults to `128000`.

Both values must be positive integers.

## Serve over stdio

For a local process, retrieve `McpServerService` from the Nest application
context and provide the named server explicitly:

```ts
const app = await NestFactory.createApplicationContext(AppModule);
await app.get(McpServerService).startStdio("projects_mcp");
```

## Exports

- `NestMcpModule` - registers discovery, validation, invocation, and server
  providers.
- `McpTools`, `McpTool`, `McpArgs`, `McpContext` - tool-definition decorators.
- `McpServerService` - creates MCP SDK server instances, lists tools, and calls
  tools programmatically.
- `McpRequestContext`, `McpToolArgs`, `McpToolOptions`, and tool metadata types.
