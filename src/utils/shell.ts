import { exec } from "node:child_process";

export const getRunner = () => {
  const userAgent = process.env.npm_config_user_agent || "";
  if (userAgent.includes("bun")) return "bunx";
  if (userAgent.includes("pnpm")) return "pnpm dlx";
  return "npx";
};

export const asyncExec = (command: string) =>
  new Promise<string>((resolve, reject) => {
    exec(`${getRunner()} ${command}`, (error, stdout, stderr) => {
      if (error) {
        reject(stderr || error.message);
      } else {
        resolve(stdout);
      }
    });
});