import { Module } from "@nestjs/common";
import { DiscoveryModule, MetadataScanner, Reflector } from "@nestjs/core";

import { McpContextFactory } from "./mcp.context.js";
import { McpInvoker } from "./mcp.invoker.js";
import { McpRegistry } from "./mcp.registry.js";
import { McpServerService } from "./mcp.server.js";
import { McpValidationService } from "./mcp.validation.js";

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
export class NestMcpModule {}
