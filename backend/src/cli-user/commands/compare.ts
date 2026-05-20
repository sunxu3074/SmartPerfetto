// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import * as path from 'path';
import { bootstrap } from '../bootstrap';
import { CliAnalyzeService } from '../services/cliAnalyzeService';
import { createRenderer, type OutputFormat } from '../repl/renderer';
import { startSession } from '../services/turnRunner';
import { assertAnalysisRuntimeReady } from '../services/runtimeGuard';
import { withConsoleLogToStderr } from '../io/stdio';

export interface CompareCommandArgs {
  currentTrace: string;
  referenceTrace: string;
  query: string;
  envFile?: string;
  sessionDir?: string;
  verbose: boolean;
  noColor: boolean;
  format?: OutputFormat;
}

export async function runCompareCommand(args: CompareCommandArgs): Promise<number> {
  const currentTracePath = path.resolve(args.currentTrace);
  const referenceTracePath = path.resolve(args.referenceTrace);
  const { paths } = bootstrap({ envFile: args.envFile, sessionDir: args.sessionDir });
  const renderer = createRenderer({ verbose: args.verbose, useColor: !args.noColor, format: args.format });
  const service = new CliAnalyzeService();
  let exitCode = 0;

  try {
    await withConsoleLogToStderr(renderer.format !== 'text', async () => {
      assertAnalysisRuntimeReady();
      const turn = await startSession({ paths, service, renderer }, {
        tracePath: currentTracePath,
        referenceTracePath,
        query: args.query.trim(),
      });
      exitCode = turn.success ? 0 : 1;
    });
    return exitCode;
  } catch (err) {
    renderer.printError((err as Error).message);
    return 1;
  } finally {
    await service.shutdown();
  }
}
