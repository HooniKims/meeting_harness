#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { main } from "../src/cli.js";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`오류: ${error.message}`);
    process.exitCode = 1;
  });
}
