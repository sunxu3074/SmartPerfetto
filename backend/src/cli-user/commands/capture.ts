// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { bootstrap } from '../bootstrap';
import type { OutputFormat } from '../repl/renderer';
import { getAdbService } from '../../services/adb/adbService';

export interface CaptureAndroidCommandArgs {
  app: string;
  durationSeconds: number;
  out: string;
  serial?: string;
  envFile?: string;
  sessionDir?: string;
  format?: OutputFormat;
}

export async function runCaptureAndroidCommand(args: CaptureAndroidCommandArgs): Promise<number> {
  const outPath = path.resolve(args.out);
  bootstrap({ envFile: args.envFile, sessionDir: args.sessionDir, requireLlm: false });
  const format = args.format ?? 'text';

  try {
    if (!args.app?.trim()) throw new Error('--app <package> is required');
    if (!Number.isFinite(args.durationSeconds) || args.durationSeconds <= 0) {
      throw new Error('--duration must be a positive number of seconds');
    }

    const adb = getAdbService();
    const adbPath = adb.getAdbPath();
    const devices = await adb.listDevices();
    const ready = devices.filter((d) => d.state === 'device');
    const device = args.serial
      ? ready.find((d) => d.serial === args.serial)
      : ready.length === 1
        ? ready[0]
        : undefined;
    if (!device) {
      if (args.serial) throw new Error(`no connected adb device with serial ${args.serial}`);
      if (ready.length === 0) throw new Error('no connected adb device');
      throw new Error(`multiple adb devices connected; pass --serial (${ready.map((d) => d.serial).join(', ')})`);
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const remotePath = `/data/misc/perfetto-traces/smartperfetto-${Date.now()}.perfetto-trace`;
    const config = buildPerfettoConfig(args.app, Math.round(args.durationSeconds * 1000));
    const timeoutMs = Math.round(args.durationSeconds * 1000) + 30000;

    writeProgress(format, `capturing ${args.durationSeconds}s trace from ${device.serial} (${args.app})`);
    await runAdb(adbPath, device.serial, ['shell', 'perfetto', '-c', '-', '--txt', '-o', remotePath], config, timeoutMs);
    await runAdb(adbPath, device.serial, ['pull', remotePath, outPath], undefined, 120000);
    await runAdb(adbPath, device.serial, ['shell', `rm -f ${remotePath}`], undefined, 10000).catch(() => undefined);

    const payload = { ok: true, serial: device.serial, app: args.app, durationSeconds: args.durationSeconds, out: outPath };
    if (format === 'json' || format === 'ndjson') console.log(JSON.stringify(payload, null, format === 'json' ? 2 : 0));
    else console.log(outPath);
    return 0;
  } catch (err) {
    if (format === 'json' || format === 'ndjson') {
      console.error(JSON.stringify({ ok: false, type: 'error', error: (err as Error).message }));
    } else {
      console.error(`Error: ${(err as Error).message}`);
    }
    return 1;
  }
}

function buildPerfettoConfig(packageName: string, durationMs: number): string {
  const categories = ['am', 'wm', 'gfx', 'view', 'input', 'sched', 'freq', 'idle', 'binder_driver'];
  return [
    'buffers { size_kb: 65536 fill_policy: RING_BUFFER }',
    'data_sources {',
    '  config {',
    '    name: "linux.ftrace"',
    '    ftrace_config {',
    ...categories.map((category) => `      atrace_categories: "${category}"`),
    `      atrace_apps: "${escapeTextProto(packageName)}"`,
    '      ftrace_events: "sched/sched_switch"',
    '      ftrace_events: "sched/sched_waking"',
    '      ftrace_events: "power/cpu_frequency"',
    '      ftrace_events: "power/cpu_idle"',
    '    }',
    '  }',
    '}',
    `duration_ms: ${durationMs}`,
    'flush_period_ms: 5000',
    '',
  ].join('\n');
}

function escapeTextProto(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function writeProgress(format: OutputFormat, message: string): void {
  if (format === 'text') console.log(message);
  else if (format === 'ndjson') console.log(JSON.stringify({ type: 'progress', message }));
}

function runAdb(
  adbPath: string,
  serial: string,
  args: string[],
  stdin?: string,
  timeoutMs = 30000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(adbPath, ['-s', serial, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`adb command timed out after ${timeoutMs / 1000}s: ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || stdout || `adb exited with code ${code}`).trim()));
    });

    if (stdin !== undefined) child.stdin.end(stdin);
    else child.stdin.end();
  });
}
