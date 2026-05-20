// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import * as path from 'path';
import { bootstrap } from '../bootstrap';
import type { OutputFormat } from '../repl/renderer';
import { CliAnalyzeService } from '../services/cliAnalyzeService';
import { getTraceProcessorService } from '../../services/traceProcessorService';
import { createSkillExecutor } from '../../services/skillEngine/skillExecutor';
import { ensureSkillRegistryInitialized, skillRegistry } from '../../services/skillEngine/skillLoader';
import { withConsoleLogToStderr } from '../io/stdio';

export interface SkillCommandArgs {
  trace: string;
  skillId: string;
  params?: string;
  envFile?: string;
  sessionDir?: string;
  format?: OutputFormat;
}

export async function runSkillCommand(args: SkillCommandArgs): Promise<number> {
  const tracePath = path.resolve(args.trace);
  bootstrap({ envFile: args.envFile, sessionDir: args.sessionDir, requireLlm: false });
  const format = args.format ?? 'text';
  const service = new CliAnalyzeService();

  try {
    const params = parseParams(args.params);
    const { traceId, result } = await withConsoleLogToStderr(format !== 'text', async () => {
      await ensureSkillRegistryInitialized();
      const skill = skillRegistry.getSkill(args.skillId);
      if (!skill) {
        throw new Error(`unknown skill: ${args.skillId}`);
      }

      const loadedTraceId = await service.loadTrace(tracePath);
      const executor = createSkillExecutor(
        getTraceProcessorService(),
        undefined,
        (event) => {
          if (format === 'ndjson') {
            process.stdout.write(`${JSON.stringify({ type: 'event', event })}\n`);
          }
        },
      );
      executor.setFragmentRegistry(skillRegistry.getFragmentCache());
      executor.registerSkills(skillRegistry.getAllSkills());

      const skillResult = await executor.execute(args.skillId, loadedTraceId, params);
      return { traceId: loadedTraceId, result: skillResult };
    });
    writeSkillOutput(format, {
      tracePath,
      traceId,
      skillId: args.skillId,
      params,
      result,
    });
    return result.success === false ? 1 : 0;
  } catch (err) {
    writeError(format, (err as Error).message);
    return 1;
  } finally {
    await service.shutdown();
  }
}

function parseParams(raw: string | undefined): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--params must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function writeSkillOutput(format: OutputFormat, payload: Record<string, unknown>): void {
  const result = payload.result as { success?: boolean } | undefined;
  const ok = result?.success !== false;
  if (format === 'json') {
    console.log(JSON.stringify({ ok, ...payload }, null, 2));
    return;
  }
  if (format === 'ndjson') {
    console.log(JSON.stringify({ type: 'complete', ok, ...payload }));
    return;
  }
  console.log(JSON.stringify(payload.result, null, 2));
}

function writeError(format: OutputFormat, message: string): void {
  if (format === 'json' || format === 'ndjson') {
    console.error(JSON.stringify({ ok: false, type: 'error', error: message }));
  } else {
    console.error(`Error: ${message}`);
  }
}
