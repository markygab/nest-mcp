# Publishing

This document applies after this package is moved to the public
`github.com/markygab/nest-mcp` repository.

## First release

1. Ensure the package name is `@markygab/nest-mcp` and the version is new.
2. Run `npm test`, `npm run typecheck`, and `npm pack --dry-run`.
3. Inspect the output of `npm pack --dry-run`; it must contain only the
   compiled package artefact and public documentation.
4. With npm two-factor authentication enabled, run:

   ```bash
   npm publish --access public
   ```

## Automated releases

After the first release, configure npm Trusted Publishing for the GitHub
repository and its release workflow. The workflow requires `contents: read`
and `id-token: write` permissions, Node 22.14 or later, and npm CLI 11.5.1 or
later. Its publish job can then run `npm publish --access public` without an
npm token.

The `repository.url` in `package.json` must exactly match the public GitHub
repository before Trusted Publishing is configured.
