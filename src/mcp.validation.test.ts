import { describe, expect, it, vi } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";

import { McpValidationService } from "./mcp.validation.js";

describe("McpValidationService", () => {
  it("uses JSON Schema 2020-12 keywords", () => {
    const validation = new McpValidationService();
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      prefixItems: [{ type: "string" }, { type: "number" }],
      items: false,
    };

    expect(validation.validate(schema, ["tool", 1])).toEqual(["tool", 1]);
    expect(() => validation.validate(schema, ["tool", "one"])).toThrow(
      /should be number/u,
    );
  });

  it("validates nested and recursive local $ref definitions", () => {
    const validation = new McpValidationService();
    const schema = {
      $defs: {
        node: {
          type: "object",
          properties: {
            children: {
              type: "array",
              items: { $ref: "#/$defs/node" },
            },
            value: { $ref: "#/$defs/value" },
          },
          required: ["value"],
        },
        value: {
          type: "object",
          properties: { id: { type: "string", minLength: 1 } },
          required: ["id"],
        },
      },
      $ref: "#/$defs/node",
    };
    const validValue = {
      children: [
        {
          children: [{ value: { id: "grandchild" } }],
          value: { id: "child" },
        },
      ],
      value: { id: "root" },
    };

    expect(validation.validate(schema, validValue)).toBe(validValue);
    expect(() =>
      validation.validate(schema, {
        children: [{ value: { id: "" } }],
        value: { id: "root" },
      }),
    ).toThrow(/\/children\/0\/value\/id: should NOT have fewer than 1 characters/u);
  });

  it("caches validators by schema identity", () => {
    const compile = vi.spyOn(Ajv2020.prototype, "compile");
    const validation = new McpValidationService();
    const schema = { type: "object", properties: { id: { type: "string" } } };

    validation.validate(schema, { id: "first" });
    validation.validate(schema, { id: "second" });

    expect(compile).toHaveBeenCalledTimes(1);
    compile.mockRestore();
  });
});
