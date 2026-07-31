#!/usr/bin/env node
import { main } from '../src/cli.mjs';

main().then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`copilot-byok: ${message}`);
  process.exitCode = 1;
});
