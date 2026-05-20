<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2024-2026 Gracker (Chris)
This file is part of SmartPerfetto. See LICENSE for details.
-->

# SmartPerfetto CLI

[English](cli.en.md) | [中文](cli.md)

SmartPerfetto CLI 是正式的终端入口。用户只需要 `smp` 或
`smartperfetto`，不启动 Web UI，也能完成配置诊断、trace 分析、多轮追问、
SQL 查询、Skill 运行、报告导出和本地历史管理。

## 安装

```bash
npm install -g @gracker/smartperfetto
```

要求 Node.js 24 LTS。npm CLI 包内置 Linux x64、macOS arm64 和 Windows x64
的固定版本 `trace_processor_shell`。如果当前平台没有内置 binary，CLI 会下载
固定版本；下载不可用时可以配置 `TRACE_PROCESSOR_PATH` 指向本机已有可执行文件。

## 全局选项

```text
Usage: smp [options] [command]

Options:
  -V, --version             output the version number
  -f, --file <trace>        trace file to analyze (shortcut for `analyze <trace>`)
  -p, --prompt <question>   analysis prompt (shortcut for --query)
  -q, --query <question>    analysis question (alias for --prompt)
  --session-dir <path>      override session storage root (default: ~/.smartperfetto)
  --env-file <path>         path to .env file (default: backend/.env)
  --verbose                 show verbose event stream
  --no-color                disable ANSI colors
  --resume <sessionId>      start the REPL with this session already loaded
  -h, --help                display help for command
```

## 核心工作流

```bash
smp run trace.perfetto-trace "分析启动慢的原因"
smp ask <sessionId> "为什么 RenderThread 慢？"
smp repl --resume <sessionId>
```

兼容旧入口仍然可用：

```bash
smp analyze trace.perfetto-trace --query "分析启动慢的原因"
smp resume <sessionId> --query "继续追问"
smp list
smp show <sessionId>
smp report <sessionId> --open
smp rm <sessionId>
```

分析类命令支持机器可读输出：

```bash
smp run trace.perfetto-trace "分析启动慢的原因" --format json
smp resume <sessionId> --query "继续追问" --format ndjson
```

`--format` 可选值：`text`、`json`、`ndjson`。

## 配置与 Provider

```bash
smp doctor --format text
smp doctor --format json
smp config init
smp config init --force
smp provider list
smp provider list --format json
smp provider test system
smp provider test <providerId> --format json
```

Runtime 判断按实际选择的 provider/runtime 执行：

- Claude Agent SDK：允许 API key、Anthropic-compatible proxy、Bedrock、
  Vertex，也允许本地 Claude 登录态 fallback。
- OpenAI Agents SDK：需要 `OPENAI_API_KEY`，或本地
  `localhost` / `127.0.0.1` / `0.0.0.0` OpenAI-compatible endpoint。
- Ollama provider 默认走 OpenAI-compatible runtime。

第一轮 CLI 不提供 `provider add/edit`，涉及密钥写入的交互配置仍由正式配置文件
或后续安全交互设计处理。

## Trace 查询与 Skill

```bash
smp query trace.perfetto-trace --sql "select count(*) as cnt from slice"
smp query trace.perfetto-trace --sql "select count(*) from slice" --format json

smp skill trace.perfetto-trace startup_slow_reasons
smp skill trace.perfetto-trace startup_slow_reasons --params '{"package":"com.example"}' --format json
```

`query` 和 `skill` 不需要启动 Web UI。`skill` 会加载 SmartPerfetto 内置
YAML Skills 和 SQL fragments。

## 双 Trace 对比

```bash
smp compare current.perfetto-trace reference.perfetto-trace --query "对比启动阶段差异"
smp compare current.perfetto-trace reference.perfetto-trace --query "对比卡顿根因" --format ndjson
```

`compare` 会把第二个 trace 作为 reference trace 传给 AI runtime，启用双 trace
分析工具。CLI 会自动附加深度对比契约，要求报告包含指标矩阵、阶段/热点差异、
阻塞与调度差异、系统因素排除、证据限制和下一步建议，避免只输出耗时差值。
同时，CLI 会在报告末尾追加固定 SQL 生成的“CLI 确定性对比附录”，至少覆盖
package、Perfetto 原始 startup_type、dur delta、启动窗口 top slices 和主线程
状态分布。startup_type 在附录里是原始字段，不等同于 CLI 二次判定；如果
cold/warm 口径与 trace 信号冲突，报告正文必须列为证据限制。

## 报告与历史

```bash
smp list
smp list --json
smp list --format json
smp show <sessionId>
smp report <sessionId>
smp report <sessionId> --turn 1
smp report <sessionId> --open
smp report export <sessionId> --format html --out report.html
smp report export <sessionId> --turn 1 --format html --out turn-001.html
smp report export <sessionId> --format md --out report.md
smp report export <sessionId> --format json --out report.json
```

CLI 文件存储在：

```text
~/.smartperfetto/
├── index.json
├── traces/
└── sessions/<sessionId>/
    ├── config.json
    ├── conclusion.md
    ├── report.html
    ├── transcript.jsonl
    ├── stream.jsonl
    └── turns/
        ├── 001.md
        └── 001.html
```

## Android 采集

第一版只支持本地 adb connected device：

```bash
smp capture android --app com.example.app --duration 10 --out launch.perfetto-trace
smp capture android --app com.example.app --duration 10 --serial <adbSerial> --out launch.perfetto-trace
```

当连接多个设备时必须传 `--serial`。

## REPL

```bash
smp repl
smp repl --resume <sessionId>
```

REPL 内部命令：

| 命令 | 作用 |
| --- | --- |
| `/load <trace>` | 加载 trace 并开始分析 |
| `/ask <query>` | 对当前 session 追问 |
| `/resume <sessionId>` | 切换到已有 session |
| `/report` | 打印最新 report 路径 |
| `/focus` | 显示当前 session 状态 |
| `/clear` | 清屏 |
| `/exit` | 退出 |
