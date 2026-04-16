import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getRunner, asyncExec, asyncExecSimple } from "../../src/utils/shell.js";

describe("getRunner", () => {
  const originalUserAgent = process.env.npm_config_user_agent;

  afterEach(() => {
    if (originalUserAgent === undefined) {
      delete process.env.npm_config_user_agent;
    } else {
      process.env.npm_config_user_agent = originalUserAgent;
    }
  });

  test("returns 'bunx' when user agent contains 'bun'", () => {
    process.env.npm_config_user_agent = "bun/1.0.0";
    expect(getRunner()).toBe("bunx");
  });

  test("returns 'pnpm dlx' when user agent contains 'pnpm'", () => {
    process.env.npm_config_user_agent = "pnpm/8.0.0";
    expect(getRunner()).toBe("pnpm dlx");
  });

  test("returns 'npx' for unknown user agent", () => {
    process.env.npm_config_user_agent = "npm/9.0.0";
    expect(getRunner()).toBe("npx");
  });

  test("returns 'npx' when user agent is empty", () => {
    delete process.env.npm_config_user_agent;
    expect(getRunner()).toBe("npx");
  });
});

describe("asyncExecSimple", () => {
  const originalUserAgent = process.env.npm_config_user_agent;

  beforeEach(() => {
    process.env.npm_config_user_agent = "bun/1.0.0";
  });

  afterEach(() => {
    if (originalUserAgent === undefined) {
      delete process.env.npm_config_user_agent;
    } else {
      process.env.npm_config_user_agent = originalUserAgent;
    }
  });

  test("returns stdout for a simple echo command", async () => {
    const result = await asyncExecSimple("echo hello");
    expect(result.trim()).toBe("hello");
  });
});

describe("asyncExec", () => {
  test("rejects on invalid command", async () => {
    await expect(asyncExec("nonexistentcommandthatdoesnotexist_xyz")).rejects.toThrow(
      "Command failed:"
    );
  });

  test("rejects when command fails", async () => {
    await expect(asyncExec("false")).rejects.toThrow("Command failed:");
  });
});
