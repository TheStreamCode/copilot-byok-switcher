#!/usr/bin/env node
import { main } from '../src/cli.mjs';

// process.exitCode rather than process.exit(): on POSIX, writes to a piped stdout
// are asynchronous and process.exit() would discard whatever is still buffered,
// truncating `copilot-byok --dry-run | consumer`. Handles that would otherwise
// keep the process alive (the router's keep-alive sockets) are closed by the
// router itself, so the event loop drains on its own.
main().then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`copilot-byok: ${message}`);
  process.exitCode = 1;
});
