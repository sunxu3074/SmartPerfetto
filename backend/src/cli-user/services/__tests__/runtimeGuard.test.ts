// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assertAnalysisRuntimeReady } from '../runtimeGuard';
import { resetProviderService } from '../../../services/providerManager';

describe('runtime guard', () => {
  const originalEnv = { ...process.env };
  let tmpDir: string;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartperfetto-runtime-guard-'));
    process.env = { ...originalEnv, PROVIDER_DATA_DIR_OVERRIDE: tmpDir };
    delete process.env.SMARTPERFETTO_AGENT_RUNTIME;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.CLAUDE_BINARY_PATH;
    resetProviderService();
  });

  afterEach(() => {
    resetProviderService();
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  test('allows Claude runtime without explicit env credentials for local auth fallback', () => {
    process.env.CLAUDE_BINARY_PATH = createExecutableStub(tmpDir);
    const result = assertAnalysisRuntimeReady();
    expect(result.selection.kind).toBe('claude-agent-sdk');
  });

  test('rejects Claude runtime when explicit SDK binary path is not executable', () => {
    process.env.CLAUDE_BINARY_PATH = path.join(tmpDir, 'missing-claude-binary');
    expect(() => assertAnalysisRuntimeReady()).toThrow('native binary is not executable');
  });

  test('rejects OpenAI runtime without an API key or local endpoint', () => {
    process.env.SMARTPERFETTO_AGENT_RUNTIME = 'openai-agents-sdk';
    expect(() => assertAnalysisRuntimeReady()).toThrow('OpenAI runtime is selected');
  });

  test('allows OpenAI runtime with a localhost endpoint', () => {
    process.env.SMARTPERFETTO_AGENT_RUNTIME = 'openai-agents-sdk';
    process.env.OPENAI_BASE_URL = 'http://localhost:11434/v1';
    const result = assertAnalysisRuntimeReady();
    expect(result.selection.kind).toBe('openai-agents-sdk');
  });

  test('uses saved session runtime override instead of current env selection', () => {
    process.env.SMARTPERFETTO_AGENT_RUNTIME = 'openai-agents-sdk';
    process.env.CLAUDE_BINARY_PATH = createExecutableStub(tmpDir);
    const result = assertAnalysisRuntimeReady({
      providerId: null,
      runtimeOverride: 'claude-agent-sdk',
    });
    expect(result.selection.kind).toBe('claude-agent-sdk');
    expect(result.selection.source).toBe('snapshot');
  });
});

function createExecutableStub(dir: string): string {
  const file = path.join(dir, 'claude-stub');
  fs.writeFileSync(file, '#!/bin/sh\nexit 0\n', 'utf-8');
  fs.chmodSync(file, 0o755);
  return file;
}
