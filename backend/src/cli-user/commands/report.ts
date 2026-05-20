// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

/**
 * `smartperfetto report <sessionId>` — print or open the session's HTML report.
 *
 * PR2 supports `--open` only. `--rebuild` (regenerate from stream.jsonl) is
 * deferred — it requires replaying the orchestrator-populated session fields
 * that `analyze` collects at run time, which isn't trivially possible from
 * the raw event stream alone.
 */

import * as fs from 'fs';
import * as path from 'path';
import { bootstrap } from '../bootstrap';
import { loadSession, turnReportPath } from '../io/sessionStore';
import { openPath } from '../io/openFile';

export interface ReportCommandArgs {
  sessionId: string;
  open: boolean;
  turn?: number;
  envFile?: string;
  sessionDir?: string;
}

export interface ReportExportCommandArgs {
  sessionId: string;
  format: 'html' | 'md' | 'json';
  out: string;
  turn?: number;
  envFile?: string;
  sessionDir?: string;
}

export async function runReportCommand(args: ReportCommandArgs): Promise<number> {
  const { paths } = bootstrap({ envFile: args.envFile, sessionDir: args.sessionDir, requireLlm: false });
  const { sp, config } = loadSession(paths, args.sessionId);

  if (!config) {
    console.error(`Error: no session found at ${sp.dir}`);
    return 1;
  }

  const reportPath = args.turn ? turnReportPath(sp, args.turn) : sp.report;
  if (!fs.existsSync(reportPath)) {
    console.error(args.turn
      ? `Error: no turn ${args.turn} HTML report in ${sp.turnsDir}`
      : `Error: no report.html in ${sp.dir}`);
    console.error(`(Report was not generated — run \`smp ask ${args.sessionId} "retry report generation"\` or start a new \`smp run <trace> "question"\`.)`);
    return 1;
  }

  console.log(reportPath);

  if (args.open) {
    const r = openPath(reportPath);
    if (!r.ok) {
      console.error(`Error: ${r.reason}`);
      return 1;
    }
  }

  return 0;
}

export async function runReportExportCommand(args: ReportExportCommandArgs): Promise<number> {
  const outPath = path.resolve(args.out);
  const { paths } = bootstrap({ envFile: args.envFile, sessionDir: args.sessionDir, requireLlm: false });
  const { sp, config } = loadSession(paths, args.sessionId);

  if (!config) {
    console.error(`Error: no session found at ${sp.dir}`);
    return 1;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  switch (args.format) {
    case 'html': {
      const source = args.turn ? turnReportPath(sp, args.turn) : sp.report;
      if (!fs.existsSync(source)) {
        console.error(args.turn
          ? `Error: no turn ${args.turn} HTML report in ${sp.turnsDir}`
          : `Error: no report.html in ${sp.dir}`);
        return 1;
      }
      fs.copyFileSync(source, outPath);
      break;
    }
    case 'md':
      fs.writeFileSync(outPath, args.turn
        ? buildTurnMarkdownExport(sp, args.turn, config)
        : buildMarkdownExport(sp, config), 'utf-8');
      break;
    case 'json':
      fs.writeFileSync(outPath, JSON.stringify(args.turn
        ? buildTurnJsonExport(sp, args.turn, config)
        : buildJsonExport(sp, config), null, 2), 'utf-8');
      break;
    default:
      console.error(`Error: unsupported report format: ${args.format}`);
      return 2;
  }

  console.log(outPath);
  return 0;
}

function buildTurnMarkdownExport(
  sp: ReturnType<typeof loadSession>['sp'],
  turn: number,
  config: NonNullable<ReturnType<typeof loadSession>['config']>,
): string {
  const file = path.join(sp.turnsDir, `${String(turn).padStart(3, '0')}.md`);
  const body = readIfExists(file);
  return [
    '# SmartPerfetto CLI Turn Report',
    '',
    `- Session: ${config.sessionId}`,
    `- Turn: ${turn}`,
    `- Trace: ${config.tracePath}`,
    ...(config.referenceTracePath ? [`- Reference Trace: ${config.referenceTracePath}`] : []),
    '',
    body || '*(no turn markdown)*',
    '',
  ].join('\n');
}

function buildMarkdownExport(sp: ReturnType<typeof loadSession>['sp'], config: NonNullable<ReturnType<typeof loadSession>['config']>): string {
  const lines: string[] = [
    '# SmartPerfetto CLI Report',
    '',
    `- Session: ${config.sessionId}`,
    `- Trace: ${config.tracePath}`,
    ...(config.referenceTracePath ? [`- Reference Trace: ${config.referenceTracePath}`] : []),
    `- Turns: ${config.turnCount}`,
    `- Updated: ${new Date(config.lastTurnAt).toISOString()}`,
    '',
    '## Latest Conclusion',
    '',
    readIfExists(sp.conclusion) || '*(no conclusion)*',
    '',
  ];

  const turnFiles = fs.existsSync(sp.turnsDir)
    ? fs.readdirSync(sp.turnsDir).filter((f) => f.endsWith('.md')).sort()
    : [];
  if (turnFiles.length) {
    lines.push('## Turns', '');
    for (const file of turnFiles) {
      lines.push(readIfExists(path.join(sp.turnsDir, file)), '');
    }
  }
  return lines.join('\n');
}

function buildJsonExport(sp: ReturnType<typeof loadSession>['sp'], config: NonNullable<ReturnType<typeof loadSession>['config']>): Record<string, unknown> {
  return {
    ok: true,
    config,
    conclusion: readIfExists(sp.conclusion),
    transcript: readTranscript(sp.transcript),
    files: {
      sessionDir: sp.dir,
      reportHtml: fs.existsSync(sp.report) ? sp.report : null,
      turnReports: listTurnReports(sp),
      conclusion: fs.existsSync(sp.conclusion) ? sp.conclusion : null,
      transcript: fs.existsSync(sp.transcript) ? sp.transcript : null,
    },
  };
}

function buildTurnJsonExport(
  sp: ReturnType<typeof loadSession>['sp'],
  turn: number,
  config: NonNullable<ReturnType<typeof loadSession>['config']>,
): Record<string, unknown> {
  const htmlPath = turnReportPath(sp, turn);
  const mdPath = path.join(sp.turnsDir, `${String(turn).padStart(3, '0')}.md`);
  const transcript = readTranscript(sp.transcript);
  return {
    ok: true,
    config,
    turn,
    turnMarkdown: readIfExists(mdPath),
    transcriptTurn: transcript.find((entry: any) => entry?.turn === turn) ?? null,
    files: {
      sessionDir: sp.dir,
      reportHtml: fs.existsSync(htmlPath) ? htmlPath : null,
      turnMarkdown: fs.existsSync(mdPath) ? mdPath : null,
      transcript: fs.existsSync(sp.transcript) ? sp.transcript : null,
    },
  };
}

function listTurnReports(sp: ReturnType<typeof loadSession>['sp']): string[] {
  if (!fs.existsSync(sp.turnsDir)) return [];
  return fs
    .readdirSync(sp.turnsDir)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => path.join(sp.turnsDir, f));
}

function readIfExists(file: string): string {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  } catch {
    return '';
  }
}

function readTranscript(file: string): unknown[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
}
