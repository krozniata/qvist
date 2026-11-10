// Runs other programs and waits on them.

export type Result = { code: number; out: string; err: string };

// run runs a command to the end, feeding it input on stdin.
export async function run(cmd: string[], opts: { cwd?: string; input?: string; env?: Record<string, string> } = {}): Promise<Result> {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdin: opts.input === undefined ? "ignore" : new TextEncoder().encode(opts.input),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...opts.env },
  });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, out, err };
}
