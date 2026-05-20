// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runListCommand } from '../list';
import { runReportCommand } from '../report';
import { computePaths, sessionPaths } from '../../io/paths';
import { writeConfig, writeReportHtml, writeTurnReportHtml } from '../../io/sessionStore';
import type { CliSessionConfig } from '../../types';

describe('CLI list/report command messages', () => {
  const originalCwd = process.cwd();
  let tmpDir: string;
  let sessionDir: string;
  let envFile: string;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartperfetto-cli-messages-'));
    sessionDir = path.join(tmpDir, 'home');
    envFile = path.join(tmpDir, 'empty.env');
    fs.writeFileSync(envFile, '', 'utf-8');
  });

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('empty list recommends the formal run command', async () => {
    const exitCode = await runListCommand({
      envFile,
      sessionDir,
      json: false,
      noColor: true,
    });

    expect(exitCode).toBe(0);
    const message = String(consoleLogSpy.mock.calls[0]?.[0] ?? '');
    expect(message).toContain('smp run <trace> "question"');
    expect(message).not.toContain('smp -f');
  });

  test('missing report recommends valid follow-up commands', async () => {
    const sessionId = 'session-without-report';
    const paths = computePaths(sessionDir);
    writeConfig(sessionPaths(paths, sessionId), makeConfig(sessionId));

    const exitCode = await runReportCommand({
      envFile,
      sessionDir,
      sessionId,
      open: false,
    });

    expect(exitCode).toBe(1);
    const output = consoleErrorSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain(`smp ask ${sessionId} "retry report generation"`);
    expect(output).toContain('smp run <trace> "question"');
    expect(output).not.toContain('smp -f');
    expect(output).not.toContain('smp resume');
  });

  test('report --turn prints the immutable per-turn HTML snapshot', async () => {
    const sessionId = 'session-with-turn-report';
    const paths = computePaths(sessionDir);
    const sp = sessionPaths(paths, sessionId);
    writeConfig(sp, makeConfig(sessionId));
    writeReportHtml(sp, '<html>latest</html>');
    const turnReport = writeTurnReportHtml(sp, 1, '<html>turn 1</html>');

    const exitCode = await runReportCommand({
      envFile,
      sessionDir,
      sessionId,
      open: false,
      turn: 1,
    });

    expect(exitCode).toBe(0);
    expect(consoleLogSpy).toHaveBeenCalledWith(turnReport);
  });
});

function makeConfig(sessionId: string): CliSessionConfig {
  const now = Date.now();
  return {
    sessionId,
    tracePath: '/tmp/trace.perfetto-trace',
    traceId: 'trace-id',
    createdAt: now,
    lastTurnAt: now,
    turnCount: 1,
  };
}
