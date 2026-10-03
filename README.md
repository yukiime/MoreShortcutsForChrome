# More Shortcuts for Chrome

保留 Chrome 原生新标签页，为额外快捷方式提供两种独立实现。两份扩展放在同一个仓库中，分别加载、设置和测试。

| | 方案 1：侧边栏 | 方案 3：Document PiP 浮窗 |
| --- | --- | --- |
| 源码 | `sidepanel/extension/` | `pip-shortcuts/extension/` |
| 版本 | 0.3.0 | 0.2.0 |
| 最低 Chrome | 145 | 130 |
| 显示方式 | Chrome 标签页侧栏 | 独立画中画浮窗 |
| 快捷方式管理 | 侧栏内修改名称和网址 | 管理页编辑 JSON 清单 |
| 常访问列表 | 支持可选历史权限 | 未实现 |
| 入口 | 工具栏、手动绑定命令；原生“+”自动显示实验 | 工具栏单击启动实验 |
| 权限 | sidePanel、tabs、storage、debugger、offscreen；可选 history | tabs、storage |
| 运行验收 | Chrome 154 已实测原生“+”自动显示 | 单击启动与窗口焦点尚未完成运行验收 |

两种实现均使用 Manifest V3 和原生 HTML/CSS/JavaScript，无 npm 依赖。建议先使用已实测的方案 1。方案 3 保留浮窗探索方向，当前窗口层级、透明底板和恢复行为存在限制，详见 [方案 3 说明](pip-shortcuts/README.md)。

## 方案 1：安装

1. 下载或克隆本仓库。
2. 打开 `chrome://extensions`，开启开发者模式。
3. 点击“加载已解压的扩展程序”，选择仓库的 **`sidepanel/extension/`** 文件夹。
4. 将“原生 NTP 额外快捷方式（侧边栏原型）”固定到工具栏。
5. 点击扩展按钮，创建原生新标签页并显示其侧栏。

安装无需 Node.js、Python 或构建步骤。已有旧根目录安装请先阅读 [迁移说明](docs/migration.md)，不要直接移除后另装。当前本机保留被 Git 忽略的兼容链接，原扩展卡片可以继续重新加载。

## 方案 1：使用

- **编辑快捷方式**：点击“编辑”，选择条目，修改名称和网址后保存。无协议域名按 HTTPS 处理。
- **常访问**：开启“显示常访问”，按提示授予可选历史权限。二级菜单按访问次数显示最多 20 个网站，支持收起、展开和刷新。
- **自动显示**：开启“原生新标签自动显示（实验）”，随后点击 Chrome 原生“+”自动显示新标签的侧栏。此开关默认关闭。
- **快捷键**：在 `chrome://extensions/shortcuts` 给“新建原生标签页并打开快捷方式”设置 Command+T 或其他组合，范围选“在 Chrome 中”。扩展不自动覆盖浏览器快捷键。

自动显示会短暂触发 Chrome 调试提示。代码只附着本扩展的隐藏文档，但 `debugger` 权限本身具有广泛调试能力。此路径可能受 Chrome 更新或调试限制影响；失败时仍可使用工具栏和快捷键入口。

## 方案 1：权限与数据

| 权限 | 用途 |
| --- | --- |
| `sidePanel` | 注册、显示和关闭逐标签侧栏 |
| `tabs` | 识别原生新标签页，核对目标窗口并导航 |
| `storage` | 本地保存快捷方式和设置，短期保存诊断事件 |
| `debugger` | 自动显示实验中临时激活本扩展隐藏文档 |
| `offscreen` | 承载自动显示桥接和本地历史排名 Worker |
| `history`，可选 | 用户授权后计算常访问列表 |

快捷方式和设置保存在 `chrome.storage.local`。浏览历史仅在扩展内计算，不上传。没有远程脚本、远程图标、网页注入或新标签页替换。

源码中的 `sidepanel/extension/shortcuts.json` 是初始示例清单。**复制源码或 ZIP 不会备份已编辑的个人数据**；移除扩展会删除其本地存储。

## 方案 3：安装与使用

在 `chrome://extensions` 加载 **`pip-shortcuts/extension/`**，不要选择方案 1 的目录。点击方案 3 的工具栏按钮，尝试打开原生新标签页与浮窗；后台会话标签用于持有浮窗，需要保留。使用扩展选项页编辑、保存或备份 JSON 清单。

方案 3 会尝试在离开 NTP 或切到其他应用时隐藏浮窗；失败时关闭浮窗以减少遮挡，再点击工具栏重新启动。完整使用方法、已知边界和验证范围见 [方案 3 README](pip-shortcuts/README.md)。两份扩展各自保存数据，不自动同步。比较时建议每次只启用其中一份。

## 开发与打包

开发检查使用 Node.js 22 或更新版本，打包需要 Python 3。无需 `npm install`。

```sh
npm run test:all
npm run check:all
npm run build
npm run package
```

构建副本位于 `build/sidepanel/extension/` 与 `build/pip-shortcuts/extension/`，打包产物位于 `dist/`：

- `MoreShortcutsForChrome-source.zip`：可分享的两个方案的源码、测试、说明及历史文档。
- `MoreShortcutsForChrome-sidepanel-extension.zip`：可解压加载的方案 1 扩展。
- `MoreShortcutsForChrome-pip-extension.zip`：可解压加载的方案 3 扩展。

## 目录

```text
sidepanel/              方案 1：扩展、测试、脚本和文档
pip-shortcuts/          方案 3：扩展、测试、脚本和文档
scripts/                统一构建和打包入口
docs/                   两方案共有的发布与迁移说明
```

`build/`、`dist/` 和 `.local/` 不进入 Git。`.local/` 仅保留原始本机验收资料、旧包和开发笔记；发布包不包含这些资料。

两个方案的独立说明见 [方案 1](sidepanel/README.md)和 [方案 3](pip-shortcuts/README.md)。方案 1 详细说明见 [使用与边界](sidepanel/docs/usage.md)、[架构](sidepanel/docs/architecture.md)、[验证记录](sidepanel/docs/validation.md)和 [GitHub 发布说明](docs/publishing.md)。参与开发请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
