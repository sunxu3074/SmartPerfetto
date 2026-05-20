#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

/**
 * `smartperfetto` CLI entry point.
 *
 * All async work routes through command handlers that return an exit code.
 * We call `process.exit(code)` explicitly to ensure the process terminates
 * even if some module has a stray setInterval / active handle we missed.
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { bootstrap } from './bootstrap';
import { createRenderer, parseOutputFormat, parseTextJsonFormat, type OutputFormat } from './repl/renderer';
import { CliAnalyzeService } from './services/cliAnalyzeService';
import { runRepl } from './repl';
import { runAnalyzeCommand } from './commands/analyze';
import { runResumeCommand } from './commands/resume';
import { runListCommand } from './commands/list';
import { runShowCommand } from './commands/show';
import { runReportCommand, runReportExportCommand } from './commands/report';
import { runRmCommand } from './commands/rm';
import { runDoctorCommand } from './commands/doctor';
import { runConfigInitCommand } from './commands/config';
import { runProviderListCommand, runProviderTestCommand } from './commands/provider';
import { runQueryCommand } from './commands/query';
import { runSkillCommand } from './commands/skill';
import { runCompareCommand } from './commands/compare';
import { runCaptureAndroidCommand } from './commands/capture';
import { DEFAULT_ANALYSIS_QUERY } from './constants';

interface GlobalOpts {
  file?: string;
  prompt?: string;
  query?: string;
  sessionDir?: string;
  envFile?: string;
  verbose?: boolean;
  color?: boolean;
  resume?: string;
}

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'),
    ) as { version?: unknown };
    return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function installFatalHandlers(): void {
  process.on('uncaughtException', (err) => {
    console.error(`Fatal: uncaught exception: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`Fatal: unhandled promise rejection: ${message}`);
    if (process.env.DEBUG && reason instanceof Error) console.error(reason.stack);
    process.exit(1);
  });

  process.once('SIGTERM', () => {
    process.exit(143);
  });
}

function programName(): string {
  const invoked = path.basename(process.argv[1] || '');
  if (!invoked || invoked === 'bin.js' || invoked === 'bin.ts') return 'smp';
  return invoked;
}

function main(): void {
  installFatalHandlers();

  const program = new Command();

  program
    .name(programName())
    .description('SmartPerfetto CLI — terminal-based Android Perfetto trace analysis')
    .version(readPackageVersion())
    .option('-f, --file <trace>', 'trace file to analyze (shortcut for `analyze <trace>`)')
    .option('-p, --prompt <question>', 'analysis prompt (shortcut for --query)')
    .option('-q, --query <question>', 'analysis question (alias for --prompt)')
    .option('--session-dir <path>', 'override session storage root (default: ~/.smartperfetto)')
    .option('--env-file <path>', 'path to .env file (default: backend/.env)')
    .option('--verbose', 'show verbose event stream', false)
    .option('--no-color', 'disable ANSI colors')
    .option('--resume <sessionId>', 'start the REPL with this session already loaded');

  // Shared helper — commander stores --no-color as opts.color === false.
  const globals = (): GlobalOpts => program.opts<GlobalOpts>();
  const format = (commandFormat?: string): OutputFormat => parseOutputFormat(commandFormat);
  const textJsonFormat = (commandFormat?: string) => parseTextJsonFormat(commandFormat);
  const runAndExit = async (fn: () => Promise<number>) => {
    process.exit(await fn());
  };

  program
    .command('run <trace> [question...]')
    .description('run one-shot analysis against a trace file')
    .option('--format <format>', 'output format: text, json, ndjson')
    .action(async (trace: string, question: string[] | undefined, opts: { format?: string }) => {
      const g = globals();
      await runAndExit(() => runAnalyzeCommand({
        trace,
        query: joinQuestion(question, DEFAULT_ANALYSIS_QUERY),
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        verbose: Boolean(g.verbose),
        noColor: g.color === false,
        format: format(opts.format),
      }));
    });

  program
    .command('analyze <trace>')
    .description('run one-shot analysis against a trace file')
    .option('-q, --query <question>', 'analysis question', DEFAULT_ANALYSIS_QUERY)
    .option('--format <format>', 'output format: text, json, ndjson')
    .action(async (trace: string, opts: { query?: string; format?: string }) => {
      const g = globals();
      const query = g.prompt ?? g.query ?? opts.query ?? DEFAULT_ANALYSIS_QUERY;
      await runAndExit(() => runAnalyzeCommand({
        trace,
        query,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        verbose: Boolean(g.verbose),
        noColor: g.color === false,
        format: format(opts.format),
      }));
    });

  program
    .command('ask <sessionId> <question...>')
    .description('continue a prior session with a follow-up question')
    .option('--format <format>', 'output format: text, json, ndjson')
    .action(async (sessionId: string, question: string[], opts: { format?: string }) => {
      const g = globals();
      await runAndExit(() => runResumeCommand({
        sessionId,
        query: joinQuestion(question, ''),
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        verbose: Boolean(g.verbose),
        noColor: g.color === false,
        format: format(opts.format),
      }));
    });

  program
    .command('resume <sessionId>')
    .description('continue a prior session with a follow-up question')
    .option('-q, --query <question>', 'follow-up question')
    .option('--format <format>', 'output format: text, json, ndjson')
    .action(async (sessionId: string, opts: { query?: string; format?: string }) => {
      const g = globals();
      const query = opts.query ?? g.query ?? g.prompt;
      if (!query?.trim()) {
        console.error('Fatal: resume requires --query <question>.');
        process.exit(2);
      }
      await runAndExit(() => runResumeCommand({
        sessionId,
        query,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        verbose: Boolean(g.verbose),
        noColor: g.color === false,
        format: format(opts.format),
      }));
    });

  program
    .command('repl')
    .description('start the SmartPerfetto interactive CLI')
    .option('--resume <sessionId>', 'start with this session already loaded')
    .action(async (opts: { resume?: string }) => {
      const g = globals();
      await runAndExit(() => runReplCommand({
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        verbose: Boolean(g.verbose),
        noColor: g.color === false,
        resume: opts.resume ?? g.resume,
      }));
    });

  program
    .command('doctor')
    .description('diagnose CLI runtime, provider, and trace processor setup')
    .option('--format <format>', 'output format: text or json')
    .action(async (opts: { format?: string }) => {
      const g = globals();
      await runAndExit(() => runDoctorCommand({
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        format: textJsonFormat(opts.format),
      }));
    });

  const configCmd = program.command('config').description('manage SmartPerfetto CLI configuration');
  configCmd
    .command('init')
    .description('create ~/.smartperfetto/env template')
    .option('--force', 'overwrite existing config', false)
    .option('--format <format>', 'output format: text or json')
    .action(async (opts: { force: boolean; format?: string }) => {
      const g = globals();
      await runAndExit(() => runConfigInitCommand({
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        force: opts.force,
        format: textJsonFormat(opts.format),
      }));
    });

  const providerCmd = program.command('provider').description('inspect and test configured providers');
  providerCmd
    .command('list')
    .description('list configured providers')
    .option('--format <format>', 'output format: text or json')
    .action(async (opts: { format?: string }) => {
      const g = globals();
      await runAndExit(() => runProviderListCommand({
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        format: textJsonFormat(opts.format),
      }));
    });
  providerCmd
    .command('test [target]')
    .description('test a provider id, or the resolved system runtime')
    .option('--format <format>', 'output format: text or json')
    .action(async (target: string | undefined, opts: { format?: string }) => {
      const g = globals();
      await runAndExit(() => runProviderTestCommand({
        target,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        format: textJsonFormat(opts.format),
      }));
    });

  program
    .command('list')
    .description('list stored sessions (most recent first)')
    .option('--json', 'emit JSON instead of a table', false)
    .option('--format <format>', 'output format: text or json')
    .option('--limit <n>', 'show at most N entries', (v) => parseInt(v, 10))
    .option('--since <date>', 'only entries updated at or after this date (any Date.parse input)')
    .action(async (opts: { json: boolean; format?: string; limit?: number; since?: string }) => {
      const g = globals();
      const outputFormat = textJsonFormat(opts.format);
      await runAndExit(() => runListCommand({
        json: opts.json || outputFormat !== 'text',
        limit: opts.limit,
        since: opts.since,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        noColor: g.color === false,
      }));
    });

  program
    .command('show <sessionId>')
    .description('print a session\'s latest conclusion and report path')
    .option('--open', 'also open the HTML report in the default browser', false)
    .action(async (sessionId: string, opts: { open: boolean }) => {
      const g = globals();
      await runAndExit(() => runShowCommand({
        sessionId,
        open: opts.open,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
      }));
    });

  const reportCmd = program
    .command('report')
    .description('print the HTML report path, optionally open it')
    .argument('[sessionId]', 'session id')
    .option('--open', 'open the report in the default browser', false)
    .option('--turn <number>', 'print/open an immutable per-turn HTML report', parsePositiveInteger)
    .action(async (sessionId: string | undefined, opts: { open: boolean; turn?: number }, command: Command) => {
      if (!sessionId) {
        command.help({ error: true });
        return;
      }
      const g = globals();
      await runAndExit(() => runReportCommand({
        sessionId,
        open: opts.open,
        turn: opts.turn,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
      }));
    });
  reportCmd
    .command('export <sessionId>')
    .description('export a session report as html, markdown, or json')
    .requiredOption('--format <format>', 'export format: html, md, json')
    .requiredOption('--out <path>', 'output file path')
    .option('--turn <number>', 'export an immutable per-turn report snapshot', parsePositiveInteger)
    .action(async (sessionId: string, opts: { format: string; out: string; turn?: number }, command: Command) => {
      const g = globals();
      const exportFormat = parseReportExportFormat(opts.format);
      const parentTurn = command.parent?.opts<{ turn?: number }>().turn;
      await runAndExit(() => runReportExportCommand({
        sessionId,
        format: exportFormat,
        out: opts.out,
        turn: opts.turn ?? parentTurn,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
      }));
    });

  program
    .command('query <trace>')
    .description('run SQL against a trace using trace_processor_shell')
    .requiredOption('--sql <sql>', 'SQL to execute')
    .option('--format <format>', 'output format: text, json, ndjson')
    .action(async (trace: string, opts: { sql: string; format?: string }) => {
      const g = globals();
      await runAndExit(() => runQueryCommand({
        trace,
        sql: opts.sql,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        format: format(opts.format),
      }));
    });

  program
    .command('skill <trace> <skillId>')
    .description('execute a SmartPerfetto skill against a trace')
    .option('--params <json>', 'skill params as a JSON object')
    .option('--format <format>', 'output format: text, json, ndjson')
    .action(async (trace: string, skillId: string, opts: { params?: string; format?: string }) => {
      const g = globals();
      await runAndExit(() => runSkillCommand({
        trace,
        skillId,
        params: opts.params,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        format: format(opts.format),
      }));
    });

  program
    .command('compare <currentTrace> <referenceTrace>')
    .description('compare two traces with AI-assisted analysis')
    .option('-q, --query <question>', 'comparison question')
    .option('--format <format>', 'output format: text, json, ndjson')
    .action(async (currentTrace: string, referenceTrace: string, opts: { query?: string; format?: string }) => {
      const g = globals();
      const query = opts.query ?? g.query;
      if (!query?.trim()) {
        console.error('Fatal: compare requires --query <question>.');
        process.exit(2);
      }
      await runAndExit(() => runCompareCommand({
        currentTrace,
        referenceTrace,
        query,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        verbose: Boolean(g.verbose),
        noColor: g.color === false,
        format: format(opts.format),
      }));
    });

  const captureCmd = program.command('capture').description('capture traces from local devices');
  captureCmd
    .command('android')
    .description('capture an Android Perfetto trace from a connected adb device')
    .requiredOption('--app <package>', 'target Android package name')
    .requiredOption('--out <file>', 'output trace file path')
    .option('--duration <seconds>', 'capture duration in seconds', (v) => Number.parseFloat(v), 10)
    .option('--serial <serial>', 'adb device serial when multiple devices are connected')
    .option('--format <format>', 'output format: text, json, ndjson')
    .action(async (opts: { app: string; out: string; duration: number; serial?: string; format?: string }) => {
      const g = globals();
      await runAndExit(() => runCaptureAndroidCommand({
        app: opts.app,
        durationSeconds: opts.duration,
        out: opts.out,
        serial: opts.serial,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        format: format(opts.format),
      }));
    });

  program
    .command('rm <sessionId>')
    .description('delete a local session folder (confirmation required)')
    .option('-y, --yes', 'skip confirmation prompt', false)
    .action(async (sessionId: string, opts: { yes: boolean }) => {
      const g = globals();
      await runAndExit(() => runRmCommand({
        sessionId,
        yes: opts.yes,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
      }));
    });

  // Default: no sub-command → enter REPL. This is the Claude-Code-style
  // interactive path the user asked for; the subcommands above are for
  // scripted / one-shot use.
  program.action(async () => {
    const g = globals();
    if (g.file) {
      await runAndExit(() => runAnalyzeCommand({
        trace: g.file!,
        query: g.prompt || g.query || DEFAULT_ANALYSIS_QUERY,
        envFile: g.envFile,
        sessionDir: g.sessionDir,
        verbose: Boolean(g.verbose),
        noColor: g.color === false,
        format: format(),
      }));
      return;
    }
    if (g.prompt || g.query) {
      console.error('Fatal: --prompt/--query requires --file <trace> for one-shot analysis.');
      process.exit(2);
    }

    await runAndExit(() => runReplCommand({
      envFile: g.envFile,
      sessionDir: g.sessionDir,
      verbose: Boolean(g.verbose),
      noColor: g.color === false,
      resume: g.resume,
    }));
  });

  program.parseAsync(process.argv).catch((err: Error) => {
    console.error(`Fatal: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(2);
  });
}

async function runReplCommand(args: {
  envFile?: string;
  sessionDir?: string;
  verbose: boolean;
  noColor: boolean;
  resume?: string;
}): Promise<number> {
  const { paths } = bootstrap({ envFile: args.envFile, sessionDir: args.sessionDir });
  const renderer = createRenderer({ verbose: args.verbose, useColor: !args.noColor, format: 'text' });
  const service = new CliAnalyzeService();
  try {
    await runRepl({ paths, service, renderer }, args.resume);
    return 0;
  } catch (err) {
    console.error(`Fatal: ${(err as Error).message}`);
    return 1;
  } finally {
    await service.shutdown();
  }
}

function joinQuestion(parts: string[] | undefined, fallback: string): string {
  const joined = (parts ?? []).join(' ').trim();
  return joined || fallback;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== value.trim()) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}

function parseReportExportFormat(format: string): 'html' | 'md' | 'json' {
  if (format === 'html' || format === 'md' || format === 'json') return format;
  throw new Error(`Invalid report export format: ${format}. Expected html, md, or json.`);
}

main();
