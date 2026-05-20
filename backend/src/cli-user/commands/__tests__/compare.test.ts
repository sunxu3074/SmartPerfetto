// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import { runCompareCommand } from '../compare';

jest.mock('../../bootstrap', () => ({
  bootstrap: jest.fn(() => ({ paths: { root: '/tmp/smp', sessions: '/tmp/smp/sessions' } })),
}));

jest.mock('../../services/runtimeGuard', () => ({
  assertAnalysisRuntimeReady: jest.fn(),
}));

const startSessionMock = jest.fn(async (_ctx: unknown, _input: unknown) => ({
  sessionId: 'agent-test',
  sessionDir: '/tmp/smp/sessions/agent-test',
  turn: 1,
  success: true,
  degraded: false,
}));

jest.mock('../../services/turnRunner', () => ({
  startSession: (ctx: unknown, input: unknown) => startSessionMock(ctx, input),
}));

const shutdownMock = jest.fn();

jest.mock('../../services/cliAnalyzeService', () => ({
  CliAnalyzeService: jest.fn(() => ({ shutdown: shutdownMock })),
}));

describe('runCompareCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes the user query through without adding a CLI-private comparison prompt', async () => {
    const exitCode = await runCompareCommand({
      currentTrace: './current.trace',
      referenceTrace: './reference.trace',
      query: '  对比启动慢的原因  ',
      verbose: false,
      noColor: true,
      format: 'json',
    });

    expect(exitCode).toBe(0);
    expect(startSessionMock).toHaveBeenCalledTimes(1);
    const input = (startSessionMock.mock.calls[0] as [unknown, { query: string }])[1];
    expect(input.query).toBe('对比启动慢的原因');
    expect(input.query).not.toContain('SmartPerfetto CLI 深度对比契约');
    expect(input.query).not.toContain('get_comparison_context');
  });
});
