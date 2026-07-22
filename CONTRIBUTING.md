# Contributing

Contributions should keep the package framework-focused: tool discovery,
validation, invocation, and MCP protocol construction belong here; application
authentication, authorization, transports, and vendor business logic do not.

Before opening a pull request, run:

```bash
npm test
npm run typecheck
npm run build
```

Add focused tests for every behavior change. Keep the public API small and
document any new export or runtime configuration in the README.
