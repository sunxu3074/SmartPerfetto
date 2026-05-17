<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2024-2026 Gracker (Chris) | SmartPerfetto -->

# HarmonyOS Trace 采集工具

## 采集命令

### hdc（HarmonyOS Device Connector）
相当于 Android 的 adb，用于连接鸿蒙设备。

```bash
# 查看连接设备
hdc list targets

# 文件传输
hdc file send <local> <remote>
hdc file recv <remote> <local>
```

### hitrace（鸿蒙 trace 采集）
相当于 Android 的 perfetto/atrace，用于采集系统 trace。

```bash
# 采集文本格式 trace（兼容 Perfetto trace_processor_shell 解析）
hdc shell hitrace --text -t 5 tag1 tag2 tag3 > trace.ftrace

# 查看支持的 tags
hdc shell hitrace -l
```

### 常用 hitrace tags

| Tag | 说明 |
|-----|------|
| `ace` | ACE UI 框架（ArkUI 渲染） |
| `ark` | ArkTS/Ark 虚拟机 |
| `ffrt` | FFRT 任务调度 |
| `sched` | CPU 调度 |
| `freq` | CPU 频率 |
| `disk` | 磁盘 I/O |
| `net` | 网络事件 |
| `hilog` | 系统日志 |
| `hisysevent` | 系统事件 |
| `hiperf` | 性能采样 |
| `graphic` | 图形渲染 |
| `binder` | IPC 通信 |
| `memory` | 内存分配 |
| `window` | 窗口管理 |
| `app` | 应用生命周期 |
| `power` | 功耗管理 |
| `workq` | 工作队列 |

## 文件格式

| 格式 | 后缀 | 解析器 |
|------|------|--------|
| hitrace 文本 | `.ftrace` / `.atrace` | Perfetto trace_processor_shell |
| Perfetto protobuf | `.pftrace` / `.perfetto-trace` | Perfetto trace_processor_shell |

## hidumper

系统信息 dump 工具，用于采集快照数据：

```bash
# CPU 信息
hdc shell hidumper --cpuusage

# 内存信息
hdc shell hidumper --meminfo <pid>

# 功耗信息
hdc shell hidumper --power
```
