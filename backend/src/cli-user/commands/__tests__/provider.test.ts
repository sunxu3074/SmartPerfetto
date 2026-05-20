// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runProviderTestCommand } from '../provider';
import { resetProviderService } from '../../../services/providerManager';

describe('provider CLI command', () => {
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd();
  let tmpDir: string;
  let envFile: string;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartperfetto-provider-cli-'));
    envFile = path.join(tmpDir, 'empty.env');
    fs.writeFileSync(envFile, '', 'utf-8');
    process.env = {
      ...originalEnv,
      PROVIDER_DATA_DIR_OVERRIDE: path.join(tmpDir, 'providers'),
      SMARTPERFETTO_AGENT_RUNTIME: 'claude-agent-sdk',
      CLAUDE_BINARY_PATH: path.join(tmpDir, 'missing-claude-binary'),
    };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_BASE_URL;
    resetProviderService();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetProviderService();
    process.env = originalEnv;
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('system test fails when Claude runtime binary is not executable', async () => {
    const exitCode = await runProviderTestCommand({
      envFile,
      sessionDir: path.join(tmpDir, 'home'),
      format: 'json',
    });

    expect(exitCode).toBe(1);
    const lastCall = consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1];
    const payload = JSON.parse(String(lastCall?.[0] ?? '{}'));
    expect(payload).toMatchObject({
      ok: false,
      target: 'system',
      note: 'Claude Agent SDK native binary is missing or not executable.',
    });
  });
});
