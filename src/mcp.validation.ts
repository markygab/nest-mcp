import { Injectable } from "@nestjs/common";
import Ajv, { type ValidateFunction } from "ajv";

import type { McpJsonSchema } from "./mcp.types.js";

@Injectable()
export class McpValidationService {
  private readonly ajv = new Ajv({
    allErrors: true,
    jsonPointers: true,
  });
  private readonly validatorCache = new Map<object, ValidateFunction>();

  getValidator(schema: McpJsonSchema) {
    const cachedValidator = this.validatorCache.get(schema);

    if (cachedValidator) {
      return cachedValidator;
    }

    const validator = this.ajv.compile(schema);

    this.validatorCache.set(schema, validator);

    return validator;
  }

  validate(schema: McpJsonSchema, value: unknown) {
    const validator = this.getValidator(schema);

    if (validator(value)) {
      return value;
    }

    const message =
      validator.errors
        ?.map((error) => {
          const path = error.dataPath || "root";

          return `${path}: ${error.message}`;
        })
        .join("; ") ?? "Invalid MCP tool input";

    throw new Error(message);
  }
}
