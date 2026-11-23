#!/usr/bin/env bun

/**
 * CLI entry point. It exists so `package.json#bin` resolves and so the toolchain has a real
 * file to check; the command surface lands here once the CLI has behaviour to expose.
 */
const run = (): void => {
  console.log("it-aint-gravy");
};

run();
