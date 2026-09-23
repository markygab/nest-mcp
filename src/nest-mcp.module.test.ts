import { describe, expect, it } from "vitest";

import { MCP_MODULE_OPTIONS } from "./mcp.constants.js";
import { NestMcpModule } from "./nest-mcp.module.js";

describe("NestMcpModule", () => {
  it("registers global options through forRoot", () => {
    const module = NestMcpModule.forRoot({ advertiseOutputSchemas: false });

    expect(module.providers).toContainEqual({
      provide: MCP_MODULE_OPTIONS,
      useValue: { advertiseOutputSchemas: false },
    });
  });
});
