#!/usr/bin/env node
import { main } from '../src/cli.mjs';

// Explicit process.exit: when the router has been running, open handles can remain
// (keep-alive sockets, in-flight provider requests) and would keep the process alive
// after Copilot exits. stdio is 'inherit', so there is no buffered output to lose.
main().then((exitCode) => {
  process.exit(exitCode);
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`copilot-byok: ${message}`);
  process.exit(1);
});
