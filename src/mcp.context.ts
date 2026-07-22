import { Injectable } from "@nestjs/common";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";

import type { McpRequestContext } from "./mcp.types.js";

@Injectable()
export class McpContextFactory {
  create(
    extra: Pick<
      RequestHandlerExtra<ServerRequest, ServerNotification>,
      "authInfo" | "requestId" | "requestInfo" | "sessionId"
    >,
    overrides?: Partial<McpRequestContext>,
  ): McpRequestContext {
    return {
      authInfo: extra.authInfo,
      requestId: extra.requestId,
      requestInfo: extra.requestInfo,
      sessionId: extra.sessionId,
      ...overrides,
      integration: {
        ...(overrides?.integration ?? {}),
      },
    };
  }
}
