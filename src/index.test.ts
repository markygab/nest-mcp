import { describe, expect, it } from "vitest";

import {
  MCP_TOOL_METADATA,
  MCP_TOOLS_CLASS_METADATA,
} from "./index.js";
import {
  MCP_TOOL_METADATA as internalToolMetadata,
  MCP_TOOLS_CLASS_METADATA as internalToolsClassMetadata,
} from "./mcp.constants.js";

describe("package entry point", () => {
  it("exports tool discovery metadata keys", () => {
    expect(MCP_TOOLS_CLASS_METADATA).toBe(internalToolsClassMetadata);
    expect(MCP_TOOL_METADATA).toBe(internalToolMetadata);
  });
});
