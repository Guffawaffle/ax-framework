#!/usr/bin/env node

import { main } from "../src/cli/main.js";

main(process.argv.slice(2)).catch((error) => {
  const message = error?.message ?? String(error);
  console.error(`ax: ${message}`);
  process.exitCode = error?.exitCode ?? 1;
});
