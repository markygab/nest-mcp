import { DynamicModule, Module } from "@nestjs/common";
import { DiscoveryModule, MetadataScanner, Reflector } from "@nestjs/core";

import { McpContextFactory } from "./mcp.context.js";
import { MCP_MODULE_OPTIONS } from "./mcp.constants.js";
import { McpInvoker } from "./mcp.invoker.js";
import { McpRegistry } from "./mcp.registry.js";
import { McpServerService } from "./mcp.server.js";
import { McpValidationService } from "./mcp.validation.js";
import type { NestMcpModuleOptions } from "./mcp.types.js";

@Module({
  imports: [DiscoveryModule],
  providers: [
    McpContextFactory,
    McpInvoker,
    McpRegistry,
    McpServerService,
    McpValidationService,
    MetadataScanner,
    Reflector,
  ],
  exports: [McpServerService],
})
export class NestMcpModule {
  /**
   * Registers global MCP server options.
   */
  static forRoot(options: NestMcpModuleOptions = {}): DynamicModule {
    return {
      module: NestMcpModule,
      providers: [{ provide: MCP_MODULE_OPTIONS, useValue: options }],
    };
  }
}
