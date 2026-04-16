import { exec } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export const getRunner = () => {
  const userAgent = process.env.npm_config_user_agent || "";
  if (userAgent.includes("bun")) return "bunx";
  if (userAgent.includes("pnpm")) return "pnpm dlx";
  return "npx";
};

export const asyncExec = (
  command: string,
  options?: ExecOptions
): Promise<ExecResult> =>
  new Promise<ExecResult>((resolve, reject) => {
    const { timeout, cwd, env } = options || {};
    const fullCommand = `${getRunner()} ${command}`;
    const execEnv = env ? { ...process.env, ...env } : process.env;

    const child = exec(
      fullCommand,
      { timeout, cwd, env: execEnv },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `Command failed: ${fullCommand}\n${stderr || error.message}`
            )
          );
        } else {
          resolve({ stdout, stderr });
        }
      }
    );
  });

export const asyncExecSimple = (
  command: string,
  options?: ExecOptions
): Promise<string> =>
  asyncExec(command, options).then((r) => r.stdout);
