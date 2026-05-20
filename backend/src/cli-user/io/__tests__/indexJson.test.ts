// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readIndex, writeIndex, upsertSession } from '../indexJson';
import type { CliPaths } from '../paths';

describe('indexJson', () => {
  let tmpDir: string;
  let paths: CliPaths;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-test-'));
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

  test('readIndex returns empty index when file is missing', () => {
    const idx = readIndex(paths);
    expect(idx).toEqual({ version: 1, sessions: {} });
  });

  test('readIndex returns empty index when file is corrupt JSON', () => {
    fs.writeFileSync(paths.indexFile, 'not valid json {{{');
    const idx = readIndex(paths);
    expect(idx).toEqual({ version: 1, sessions: {} });
  });

  test('readIndex returns empty index when shape is wrong', () => {
    fs.writeFileSync(paths.indexFile, JSON.stringify({ version: 1, oops: 'wrong' }));
    const idx = readIndex(paths);
    expect(idx).toEqual({ version: 1, sessions: {} });
  });

  test('writeIndex then readIndex round-trips entries', () => {
    writeIndex(paths, {
      version: 1,
      sessions: {
        'agent-1': {
          sessionId: 'agent-1',
          createdAt: 100,
          lastTurnAt: 200,
          tracePath: '/tmp/foo.pftrace',
          traceFilename: 'foo.pftrace',
          firstQuery: 'hello',
          turnCount: 1,
          status: 'completed',
        },
      },
    });
    expect(readIndex(paths).sessions['agent-1']?.firstQuery).toBe('hello');
  });

  test('upsertSession adds a new entry, preserving prior ones', () => {
    upsertSession(paths, {
      sessionId: 'a',
      createdAt: 1,
      lastTurnAt: 1,
      tracePath: '/x',
      traceFilename: 'x',
      firstQuery: 'q1',
      turnCount: 1,
      status: 'completed',
    });
    upsertSession(paths, {
      sessionId: 'b',
      createdAt: 2,
      lastTurnAt: 2,
      tracePath: '/y',
      traceFilename: 'y',
      firstQuery: 'q2',
      turnCount: 1,
      status: 'completed',
    });
    const all = readIndex(paths).sessions;
    expect(Object.keys(all).sort()).toEqual(['a', 'b']);
  });

  test('upsertSession updates an existing entry in place', () => {
    upsertSession(paths, {
      sessionId: 'a',
      createdAt: 1,
      lastTurnAt: 1,
      tracePath: '/x',
      traceFilename: 'x',
      firstQuery: 'first',
      turnCount: 1,
      status: 'completed',
    });
    upsertSession(paths, {
      sessionId: 'a',
      createdAt: 1,
      lastTurnAt: 999,
      tracePath: '/x',
      traceFilename: 'x',
      firstQuery: 'first',
      turnCount: 2,
      status: 'completed',
    });
    const a = readIndex(paths).sessions.a;
    expect(a.turnCount).toBe(2);
    expect(a.lastTurnAt).toBe(999);
    expect(Object.keys(readIndex(paths).sessions)).toHaveLength(1);
  });

  test('writeIndex leaves no orphan tmp file', () => {
    upsertSession(paths, {
      sessionId: 'a',
      createdAt: 1,
      lastTurnAt: 1,
      tracePath: '/x',
      traceFilename: 'x',
      firstQuery: 'q',
      turnCount: 1,
      status: 'completed',
    });
    const stray = fs.readdirSync(tmpDir).filter((f) => f.includes('.tmp.'));
    expect(stray).toHaveLength(0);
  });
});
