#!/usr/bin/env node
import { main } from '../src/cli.mjs';

main().then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error) => {
  console.error(`copilot-byok: ${error.message}`);
  process.exitCode = 1;
});
