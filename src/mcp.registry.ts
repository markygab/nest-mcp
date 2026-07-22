import { Inject, Injectable } from "@nestjs/common";
import {
  DiscoveryService,
  MetadataScanner,
  ModuleRef,
  Reflector,
} from "@nestjs/core";

import {
  MCP_TOOL_METADATA,
  MCP_TOOL_PARAMS_METADATA,
  MCP_TOOLS_CLASS_METADATA,
  MCP_GUARDS_METADATA,
  MCP_INTERCEPTORS_METADATA,
} from "./mcp.constants.js";
import type {
  McpDiscoveredTool,
  McpGuard,
  McpGuardReference,
  McpInterceptor,
  McpInterceptorReference,
  McpParamMetadata,
  McpToolOptions,
} from "./mcp.types.js";

@Injectable()
export class McpRegistry {
  constructor(
    @Inject(DiscoveryService)
    private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner)
    private readonly metadataScanner: MetadataScanner,
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(ModuleRef)
    private readonly moduleRef: ModuleRef,
  ) {}

  discoverTools(serverName: string): McpDiscoveredTool[] {
    const providers = this.discovery.getProviders();
    const tools: McpDiscoveredTool[] = [];

    for (const provider of providers) {
      const instance = provider.instance;
      const metatype = provider.metatype;

      if (!instance || !metatype) {
        continue;
      }

      const toolServerName = this.reflector.get<string | undefined>(
        MCP_TOOLS_CLASS_METADATA,
        metatype,
      );

      if (toolServerName !== serverName) {
        continue;
      }

      this.metadataScanner
        .getAllMethodNames(Object.getPrototypeOf(instance))
        .forEach((methodName) => {
          const methodRef = instance[methodName];

          if (typeof methodRef !== "function") {
            return;
          }

          const toolMetadata = this.reflector.get<McpToolOptions | undefined>(
            MCP_TOOL_METADATA,
            methodRef,
          );

          if (!toolMetadata) {
            return;
          }

          const params =
            (Reflect.getMetadata(
              MCP_TOOL_PARAMS_METADATA,
              Object.getPrototypeOf(instance),
              methodName,
            ) as McpParamMetadata[] | undefined) ?? [];

          const classGuards =
            this.reflector.get<McpGuardReference[] | undefined>(
              MCP_GUARDS_METADATA,
              metatype,
            ) ?? [];
          const methodGuards =
            this.reflector.get<McpGuardReference[] | undefined>(
              MCP_GUARDS_METADATA,
              methodRef,
            ) ?? [];
          const classInterceptors =
            this.reflector.get<McpInterceptorReference[] | undefined>(
              MCP_INTERCEPTORS_METADATA,
              metatype,
            ) ?? [];
          const methodInterceptors =
            this.reflector.get<McpInterceptorReference[] | undefined>(
              MCP_INTERCEPTORS_METADATA,
              methodRef,
            ) ?? [];

          tools.push({
            annotations: toolMetadata.annotations,
            description: toolMetadata.description,
            guards: [...classGuards, ...methodGuards].map((guard) =>
              this.resolveGuard(guard),
            ),
            interceptors: [...classInterceptors, ...methodInterceptors].map(
              (interceptor) => this.resolveInterceptor(interceptor),
            ),
            handler: methodRef.bind(instance),
            inputSchema: toolMetadata.inputSchema,
            instance,
            methodName,
            name: toolMetadata.name,
            outputSchema: toolMetadata.outputSchema,
            params: [...params].sort((left, right) => left.index - right.index),
            title: toolMetadata.title,
          });
        });
    }

    return tools.sort((left, right) => left.name.localeCompare(right.name));
  }

  private resolveGuard(guard: McpGuardReference): McpGuard {
    if (typeof guard !== "function") {
      return guard;
    }

    return this.moduleRef.get(guard, { strict: false });
  }

  private resolveInterceptor(
    interceptor: McpInterceptorReference,
  ): McpInterceptor {
    if (typeof interceptor !== "function") {
      return interceptor;
    }

    return this.moduleRef.get(interceptor, { strict: false });
  }
}
