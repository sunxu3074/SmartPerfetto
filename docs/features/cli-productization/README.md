# SmartPerfetto CLI Productization

## 0. 开发执行 TODO

- [x] M0: 建立 CLI 产品化 TODO 与验收清单
- [x] M1: 修复当前 CLI 基础产品问题
- [x] M2: 建立完整命令体系与机器可读输出
- [x] M3: 补齐 provider/config/session/report 工作流
- [x] M4: 补齐 trace query / skill / compare / capture 工作流
- [x] M5: npm/tarball/portable 验证与最终回归
- [x] M6: 建立 CLI 进程级 E2E 与 tarball 安装后回归

## 产品边界

- SmartPerfetto 发展自己的 CLI：正式入口是 `smp` / `smartperfetto`。
- OpenCode 只作为体验参考，不接入、不依赖、不读取它的登录态。
- 第一轮不做 IDE 插件、远程 SaaS、多用户权限和 provider add/edit。
- Claude local auth fallback 是合法路径；OpenAI/Ollama 按 OpenAI runtime/provider 规则判断。

## 命令矩阵

| 场景 | 命令 | 输出 |
| --- | --- | --- |
| 一次性分析 | `smp run <trace> [question...]` | text/json/ndjson |
| 兼容一次性分析 | `smp analyze <trace> --query <question>` | text/json/ndjson |
| 多轮追问 | `smp ask <sessionId> <question...>` | text/json/ndjson |
| 兼容多轮追问 | `smp resume <sessionId> --query <question>` | text/json/ndjson |
| 交互模式 | `smp repl [--resume <sessionId>]` | text |
| 环境诊断 | `smp doctor --format text|json` | text/json |
| 初始化配置 | `smp config init` | text/json |
| Provider 列表 | `smp provider list` | text/json |
| Provider 连通性 | `smp provider test [providerId|system]` | text/json |
| Session 列表 | `smp list --json` | text/json |
| Session 展示 | `smp show <sessionId>` | text |
| Report 路径 | `smp report <sessionId>` | text |
| Report 导出 | `smp report export <sessionId> --format html|md|json --out <path>` | file |
| SQL 查询 | `smp query <trace> --sql <sql>` | text/json/ndjson |
| Skill 运行 | `smp skill <trace> <skillId> --params <json>` | text/json/ndjson |
| 双 Trace 对比 | `smp compare <currentTrace> <referenceTrace> --query <question>` | text/json/ndjson |
| Android 采集 | `smp capture android --app <package> --duration <seconds> --out <file>` | file |

## 验收命令

```bash
smp doctor --format json
smp --session-dir <tmp> list --json
smp query perfetto/test/data/api31_startup_cold.perfetto-trace --sql "select count(*) from slice"
smp skill perfetto/test/data/api31_startup_cold.perfetto-trace startup_slow_reasons
smp run perfetto/test/data/api31_startup_cold.perfetto-trace "分析启动慢的原因"
smp report export <sessionId> --format json --out <tmp>/report.json
```

## 发布验证

```bash
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix backend run cli:pack-check
npm --prefix backend run cli:e2e:dist
npm --prefix backend run cli:e2e:pack
npm --prefix backend run test:core
npm --prefix backend run test:scene-trace-regression
npm run verify:pr
cd backend && npm pack --pack-destination <tmp>
```

## CLI E2E

新增进程级 CLI E2E harness：`backend/scripts/run-cli-e2e.cjs`。

- `npm --prefix backend run cli:e2e:dist`: build 后直接运行 `dist/cli-user/bin.js`。
- `npm --prefix backend run cli:e2e:pack`: build 后执行 `cd backend && npm pack`，临时安装 tarball，再运行真实 `smp` binary。
- `npm --prefix backend run cli:e2e:live`: 可选 live 档；`SMARTPERFETTO_E2E_ADB=1` 时覆盖 `capture android`。
- E2E 默认使用 `NODE_ENV=test` + `SMARTPERFETTO_CLI_E2E_FAKE=1`，只替换 LLM turn 输出，仍走真实 CLI 子进程、trace_processor SQL、Skill 执行、session 持久化、report export、tarball 安装和二进制入口。
- E2E 强制隔离 `SMARTPERFETTO_HOME` / `--session-dir` / `--env-file` 到临时目录，不读取开发者本地 `backend/.env`；并检查 JSON/NDJSON 可解析、exit code 正确、report 文件存在、session 可追问、`rm` 生效。

## 验证记录

- M0: 文档已创建，包含 TODO、边界、命令矩阵和验收命令。
- M1: `bootstrap()` 不再执行 Claude-only credential gate；分析/REPL 改为 runtime-aware guard。新增 `run`、`ask`、`repl`、`doctor`。
- M2: 分析、query、skill、compare、capture 支持 `text` / `json` / `ndjson`；CLI 机器输出隔离内部 stdout 日志。
- M3: 新增 `config init`、`provider list/test`、`report export`，并保留 `list/show/report/rm` 兼容命令。
- M4: 新增 `query`、`skill`、`compare`、`capture android`。
- Focused verification: `npm --prefix backend run typecheck` 通过；CLI renderer/runtime guard/session 相关 Jest 通过；`doctor --format json`、`list --json`、`query --format json`、`skill --format json`、`report export --format json` smoke 通过。
- M5: `npm --prefix backend run build`、`npm --prefix backend run cli:pack-check`、`npm --prefix backend run test:core`、`npm --prefix backend run test:scene-trace-regression`、root `npm run verify:pr` 全部通过。独立 tarball 临时安装后，`smp --version`、`smp --help`、`smp doctor --format json` 通过。Hardening loop 1/2/3/4/5/6 后均已重新跑 root `npm run verify:pr` 并通过。
- Hardening loop: 修复了 `query` / `skill` / `report export` / `capture --out` 在 `bootstrap()` 后解析相对路径导致的 backend-root 错误；修复 `config init --session-dir` 写入的 env 后续不读取；收紧 `doctor` / `provider` / `config` / `list` 的 `--format` 为 text/json；修复 AI result `success=false` 时机器输出和 exit code 不一致；修复 resume/REPL guard 误用当前全局 runtime 而不是会话保存 runtime；移除 config 模板里过期的具体模型名。
- Hardening loop 2: `doctor` / runtime guard 增加 Claude Agent SDK native binary 可执行性检查，避免只有 local-auth fallback 但 SDK binary 缺失时误报可用；`provider test system` 在 active provider 场景改为真实执行 provider connection test；comparison session resume 补齐只有 `referenceTracePath` 时重新加载 reference trace 的兼容路径。
- Hardening loop 3: `provider test system` 在 Claude env/default fallback 场景复用 Claude Agent SDK native binary 可执行性检查，避免 doctor/run 已失败但 provider test 仍返回 ok；修正 `bootstrap()` env 加载注释为“后加载覆盖前加载”，保持 user env 覆盖 backend `.env` 的实际语义。
- Hardening loop 4: `ProviderService.list/get` 现在会 mask `custom.headers` 和 `custom.envOverrides` 中的敏感键，避免 `smp provider list --format json` 或其他 provider 列表接口泄漏自定义 header/env 里的 API key、token、secret。已用 dist CLI 构造含 `Authorization`、`x-api-key`、`OPENAI_API_KEY` 的 custom provider，确认 JSON 输出不包含原始 secret，非敏感 `OPENAI_BASE_URL` 保持可见。
- Hardening loop 5: 修复 text renderer 完成提示里的失效命令示例，避免继续提示需要 `--query` 的 `smp resume <sessionId>`；现在提示 `smp ask <sessionId> "..."` 和 `smp repl --resume <sessionId>`，并补 renderer 回归测试。已用 dist JS 和独立 tarball 安装产物验证完成提示不再包含失效的 `smp resume <sessionId>`。
- Hardening loop 6: 修复 `list` 空状态和 `report` 缺失 HTML 报告错误提示中的旧 CLI 示例，避免继续推荐 debug shortcut `smp -f` 或无 `--query` 的 `smp resume`；现在统一提示正式入口 `smp run` / `smp ask`，并补命令级回归测试。已用 dist JS 和独立 tarball 安装产物验证提示文本不再包含 `smp -f` 或无效 `smp resume`。
- M6: 新增 `backend/scripts/run-cli-e2e.cjs`，覆盖 `--version`、`--help`、`doctor`、`config init`、`provider list/test`、`list`、`query` JSON/NDJSON/error、`skill startup_slow_reasons`、`run`、`analyze` 兼容入口、`ask`、`resume` 兼容入口、`report export` html/md/json、`compare`、`rm`。`npm --prefix backend run cli:e2e:dist` 和 `npm --prefix backend run cli:e2e:pack` 均已通过。
- M6 hardening: E2E 发现并修复 `analyze` / `resume` / `compare` 子命令因根命令 `-q/--query` 冲突导致 `smp <command> ... --query ...` 解析不到子命令 option 的问题；现在 action 内兼容子命令和全局 query，并在缺参时返回明确错误。E2E 同时修正 tarball 安装验证方式，安装 packed CLI 时允许依赖 install scripts 运行，避免 `better-sqlite3` native binding 被测试方式误伤。
- M6 hardening 2: E2E 使用临时 `--env-file`，避免开发者本地 `backend/.env` 覆盖 `NODE_ENV=test` 后误走真实 LLM；CLI fake turn 也收紧为 `NODE_ENV=test` + `SMARTPERFETTO_CLI_E2E_FAKE=1` 双条件。
- M6 hardening 3: 使用真实 Heavy launch trace `test-traces/lacunh_heavy.pftrace` 和真实 OpenAI-compatible LLM 跑通 `run` / `ask` / `report export`。修复 CLI trace copy 仍落到 `backend/uploads/traces` 的问题，现在 `--session-dir` 会同时承载 `sessions/` 和 `traces/`；修复 trace 重新落盘后 backend persisted session traceId mismatch 导致后续恢复失败的问题，CLI session id 与 backend session id 分开记录，必要时自动降级为新 backend turn + CLI transcript context；恢复上下文现在包含 session id、session dir、report path 和最近 transcript，真实恢复追问可回答 session id、报告路径和主要慢因。
- M6 hardening 4: 针对真实 Heavy vs Light 双 trace 对比报告过浅的问题，`compare` 现在自动追加深度对比契约，并在 HTML/Markdown 报告末尾追加 CLI 固定 SQL 生成的确定性对比附录。附录覆盖 package、Perfetto 原始 startup_type、dur delta、启动窗口 top slices 和主线程状态分布；同时新增每轮不可变 HTML 报告 `turns/NNN.html`、`smp report <sessionId> --turn N` 和 `report export --turn N`，避免后续追问覆盖原始对比报告后丢失证据。已用真实 Heavy/Light trace + fake LLM 验证附录生成到 latest report 与 turn report。真实 LLM 复跑时发现 Heavy 的 `android_startups.startup_type` 原始值为 `warm`，与旧报告里的 cold 口径可能冲突；因此契约和附录已改为明确区分 raw Perfetto startup_type 与最终启动类型判定，冲突必须作为证据限制输出。
- M6 verification: `npm --prefix backend run cli:e2e`、`npm --prefix backend run cli:pack-check`、`npm --prefix backend run test:core` 均已通过。
- Tarball evidence: npm 包发布验证必须在 `backend/` 内执行 `npm pack`；`npm --prefix backend pack` 不能作为证据，因为它可能打到 root package。已使用 `cd backend && npm pack --pack-destination <tmp>` 做独立安装 smoke，`smp --version`、`smp --help`、`smp doctor --format json` 通过。Hardening loop 2 后再次验证 `gracker-smartperfetto-1.0.11.tgz`，确认安装包内 `smp doctor --format json` 包含 `claude_sdk_binary` 且状态为 `ok`。Hardening loop 3 后再次验证安装包内 `smp provider test system --format json` 在缺失 Claude SDK binary 时 exit 1 且返回 `ok:false`。Hardening loop 4 后再次验证安装包内 `smp provider list --format json` 不泄漏 custom provider 的 header/env secret。Hardening loop 6 后再次验证安装包内 `smp list` / `smp report <sessionId>` 的提示只推荐正式可用 CLI。
- Publish blocker: 当前终端 npm auth 不可用，`npm whoami` 返回 `E401 Unauthorized`，`npm access list packages @gracker` 返回 `E401`。正式发布前需要重新 `npm login` 并确认 `@gracker` scope 权限。
