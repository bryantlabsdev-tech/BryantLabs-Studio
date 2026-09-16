# Third-Party Software Notices

BryantLabs Studio uses third-party software. Those components remain subject to their own copyright notices and license terms. This summary is not a substitute for the complete license texts shipped by each package and is not legal advice.

## Direct runtime dependencies

| Package | Declared version | License family |
| --- | --- | --- |
| `@monaco-editor/react` | `^4.7.0` | MIT |
| `@xterm/addon-fit` | `^0.11.0` | MIT |
| `@xterm/xterm` | `^6.0.0` | MIT |
| `highlight.js` | `^11.11.1` | BSD-3-Clause |
| `monaco-editor` | `^0.55.1` | MIT |
| `node-pty` | `^1.1.0` | MIT |
| `react` | `^19.2.7` | MIT |
| `react-dom` | `^19.2.7` | MIT |

Development and packaging dependencies are recorded in `package.json` and the exact dependency graph is locked in `package-lock.json`. Electron distributions also contain Chromium, Node.js, and their third-party components; release packaging must retain the license and notice materials supplied with those components.

## Automated policy

Run `npm run licenses:check` after installing dependencies. The check scans installed package manifests, rejects missing or malformed license metadata, and rejects licenses outside the reviewed allowlist. An allowlisted result means “known to the policy,” not “legally approved for every distribution model.” Any new license requires human review before its identifier is added.

Before external distribution, generate and inspect a complete dependency inventory, include the exact license texts and required notices in the application bundle, and have qualified counsel review obligations that apply to the intended distribution.
