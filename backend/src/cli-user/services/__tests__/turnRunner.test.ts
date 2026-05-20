// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { sessionPaths, type CliPaths } from '../../io/paths';
import { buildResumeContextQuery, truncateAtBoundary } from '../turnRunner';

describe('truncateAtBoundary', () => {
  test('returns text unchanged when shorter than max', () => {
    expect(truncateAtBoundary('short', 100)).toBe('short');
  });

  test('cuts at trailing paragraph break when present in window', () => {
    // "lots of filler text here" is 24 chars, then "\n\n" → boundary at idx 24,
    // window=30, minAccept=21 → 24 ≥ 21 → keeps "lots of filler text here\n\n".
    const text = 'lots of filler text here\n\nsecond paragraph extends past';
    const out = truncateAtBoundary(text, 30);
    expect(out).toBe('lots of filler text here\n\n');
  });

  test('cuts at trailing CJK 句号 when present in window', () => {
    // "前面是一段相当长的中文分析。" — 句号 at index 13, window=15, minAccept=10
    // → keeps up to and including 。 (index 13, slice 0..14).
    const text = '前面是一段相当长的中文分析。后续超过了限制范围啊啊啊';
    const out = truncateAtBoundary(text, 15);
    expect(out.endsWith('。')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(15);
  });

  test('cuts at trailing Latin period+space', () => {
    // ". " at index 20, window=25, minAccept=17. Sentence cut includes the
    // period itself but not the following space — that's a clean sentence end.
    const text = 'Sentence one is here. Sentence two runs over the budget.';
    const out = truncateAtBoundary(text, 25);
    expect(out).toBe('Sentence one is here.');
  });

  test('falls back to hard cut when no boundary in trailing 30%', () => {
    // 50 chars with no boundaries — must hard-cut at 20.
    const text = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const out = truncateAtBoundary(text, 20);
    expect(out.length).toBe(20);
  });

  test('rejects boundary too early in window (before 70%)', () => {
    // Boundary at char 5 of a 100-char window → too early, hard-cut at 100.
    const text = 'foo. ' + 'x'.repeat(200);
    const out = truncateAtBoundary(text, 100);
    expect(out.length).toBe(100);
    expect(out.startsWith('foo. ')).toBe(true);
  });

  test('handles trailing newline boundary', () => {
    const text = 'line one\nline two\nline three is very long and exceeds';
    const out = truncateAtBoundary(text, 25);
    expect(out).toBe('line one\nline two\n');
  });
});

describe('buildResumeContextQuery', () => {
  let tmpDir: string;
  let paths: CliPaths;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-runner-test-'));
    paths = {
      home: tmpDir,
      sessionsRoot: path.join(tmpDir, 'sessions'),
      tracesRoot: path.join(tmpDir, 'traces'),
      indexFile: path.join(tmpDir, 'index.json'),
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('replays prior transcript turns before the follow-up question', () => {
    const sp = sessionPaths(paths, 'agent-1');
    fs.mkdirSync(sp.dir, { recursive: true });
    fs.writeFileSync(sp.transcript, [
      JSON.stringify({
        turn: 1,
        timestamp: 1,
        question: '分析 Heavy launch',
        conclusionMd: '启动慢因是 LoadSimulator_ActivityInit 和 ChaosTask。',
      }),
      '',
    ].join('\n'));

    const query = buildResumeContextQuery(sp, '报告路径在哪里？');

    expect(query).toContain('previous context below');
    expect(query).toContain('Session id: agent-1');
    expect(query).toContain(`Report path: ${sp.report}`);
    expect(query).toContain('分析 Heavy launch');
    expect(query).toContain('LoadSimulator_ActivityInit');
    expect(query).toContain('用户新问题: 报告路径在哪里？');
  });

  test('falls back to latest conclusion file when transcript is missing', () => {
    const sp = sessionPaths(paths, 'agent-2');
    fs.mkdirSync(sp.dir, { recursive: true });
    fs.writeFileSync(sp.conclusion, '上一轮结论：主线程 CPU-bound。');

    const query = buildResumeContextQuery(sp, '继续总结');

    expect(query).toContain('上一轮结论：主线程 CPU-bound。');
    expect(query).toContain('用户新问题: 继续总结');
  });

  test('returns the user query unchanged when no prior context exists', () => {
    const sp = sessionPaths(paths, 'agent-3');
    const query = buildResumeContextQuery(sp, 'plain question');
    expect(query).toBe('plain question');
  });
});
