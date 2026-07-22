import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const DEFAULT_MCP_TOOL_TIMEOUT_MS = 15_000;
const DEFAULT_MCP_TOOL_RESPONSE_BYTES = 128_000;

export const assertMcpResponseSize = (result: CallToolResult) => {
  const bytes = Buffer.byteLength(JSON.stringify(result), "utf8");

  if (bytes > getMcpResponseByteLimit()) {
    throw new Error("MCP tool response exceeds configured size limit");
  }
};

export const getMcpToolTimeoutMs = () =>
  getConfiguredPositiveInteger(
    "NEST_MCP_TOOL_TIMEOUT_MS",
    DEFAULT_MCP_TOOL_TIMEOUT_MS,
  );

export const withMcpToolTimeout = async <T>(promise: Promise<T>) => {
  const timeoutMs = getMcpToolTimeoutMs();
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`MCP tool exceeded ${timeoutMs}ms timeout`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const getMcpResponseByteLimit = () =>
  getConfiguredPositiveInteger(
    "NEST_MCP_TOOL_RESPONSE_MAX_BYTES",
    DEFAULT_MCP_TOOL_RESPONSE_BYTES,
  );

const getConfiguredPositiveInteger = (name: string, fallback: number) => {
  const configured = process.env[name]?.trim();

  if (!configured) {
    return fallback;
  }

  const value = Number(configured);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
};
