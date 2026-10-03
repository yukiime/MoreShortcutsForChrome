# More Shortcuts for Chrome

在 Chrome 原生新标签页旁显示额外快捷方式，支持侧栏内编辑、常访问二级菜单和新标签自动显示。保留原生搜索框、账号入口和默认快捷方式，进入普通网页时隐藏本扩展侧栏。

当前版本 **0.3.0**，最低 Chrome **145**。原生 HTML/CSS/JavaScript，Manifest V3，无 npm 依赖。原生“+”自动显示已在 Chrome 154 上实测，属于依赖调试能力的实验功能。

## 安装

1. 下载或克隆本仓库。
2. 打开 `chrome://extensions`，开启开发者模式。
3. 点击“加载已解压的扩展程序”，选择仓库的 **`extension/`** 文件夹。
4. 将“原生 NTP 额外快捷方式（侧边栏原型）”固定到工具栏。
5. 点击扩展按钮，创建原生新标签页并显示其侧栏。

已有安装可在原扩展卡片点击“重新加载”。保持原加载目录可以保留扩展 ID 与本地编辑数据。安装无需 Node.js、Python 或构建步骤。

## 使用

- **编辑快捷方式**：点击“编辑”，选择条目，修改名称和网址后保存。无协议域名按 HTTPS 处理。
- **常访问**：开启“显示常访问”，按提示授予可选历史权限。二级菜单按访问次数显示最多 20 个网站，支持收起、展开和刷新。
- **自动显示**：开启“原生新标签自动显示（实验）”，随后点击 Chrome 原生“+”自动显示新标签的侧栏。此开关默认关闭。
- **快捷键**：在 `chrome://extensions/shortcuts` 给“新建原生标签页并打开快捷方式”设置 Command+T 或其他组合，范围选“在 Chrome 中”。扩展不自动覆盖浏览器快捷键。

自动显示会短暂触发 Chrome 调试提示。代码只附着本扩展的隐藏文档，但 `debugger` 权限本身具有广泛调试能力。此路径可能受 Chrome 更新或调试限制影响；失败时仍可使用工具栏和快捷键入口。

## 权限与数据

| 权限 | 用途 |
| --- | --- |
| `sidePanel` | 注册、显示和关闭逐标签侧栏 |
| `tabs` | 识别原生新标签页，核对目标窗口并导航 |
| `storage` | 本地保存快捷方式和设置，短期保存诊断事件 |
| `debugger` | 自动显示实验中临时激活本扩展隐藏文档 |
| `offscreen` | 承载自动显示桥接和本地历史排名 Worker |
| `history`，可选 | 用户授权后计算常访问列表 |

快捷方式和设置保存在 `chrome.storage.local`。浏览历史仅在扩展内计算，不上传。没有远程脚本、远程图标、网页注入或新标签页替换。

源码中的 `extension/shortcuts.json` 是初始示例清单。**复制源码或 ZIP 不会备份已编辑的个人数据**；移除扩展会删除其本地存储。

## 开发与打包

开发检查使用 Node.js 22 或更新版本，打包需要 Python 3。无需 `npm install`。

```sh
npm test
npm run check
npm run build
npm run package
```

构建副本位于 `build/extension/`，打包产物位于 `dist/`：

- `MoreShortcutsForChrome-source.zip`：可分享的源码、测试、说明及归档。
- `MoreShortcutsForChrome-extension.zip`：可解压加载的当前扩展。

## 目录

```text
extension/              当前扩展，直接加载此目录
tests/                  当前扩展的 Node 测试
scripts/                静态检查、构建和打包工具
docs/                   使用、架构、验证和发布说明
docs/archive/           历史研究与设计记录
archive/pip-shortcuts/  停止作为主方案开发的 PiP 原型
```

`build/`、`dist/` 和 `.local/` 不进入 Git。`.local/` 仅保留原始本机验收资料、旧包和开发笔记；发布包不包含这些资料。

详细说明见 [使用与边界](docs/usage.md)、[架构](docs/architecture.md)、[验证记录](docs/validation.md)和 [GitHub 发布说明](docs/publishing.md)。参与开发请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
