# 方案 3：Document PiP 悬浮快捷方式

这是一份独立的 Chrome 扩展，所有源码、测试和文档都在本子文件夹。保留真正的原生新标签页，额外 40 个入口放在可拖动、缩放的置顶窗口中。与本项目的侧边栏方案 1 分别加载。

**当前为 0.1.2，仍是兼容性实验工具。** 切到其他应用时尝试最小化浮窗；Chrome 不支持隐藏时，来源页关闭自己的浮窗，避免继续遮挡，需要重新点击启动。这是遮挡退路，尚未满足“其他应用、浮窗、Chrome”的完整窗口顺序。纯透明原生底板同样未实现。

本轮自动测试通过，Chrome 已加载 0.1.2 并显示真实 40 项浮窗；后续实测遇到锁屏，关闭退路及重新启动的真实效果尚未验收。见 [本轮改进记录](docs/improvement-plan.md) 与 [验证报告](validation/report.md)。

## 加载与启动

1. Chrome 打开 `chrome://extensions/`，启用开发者模式。
2. 加载已解压的扩展程序，选择本文件夹内的 **extension** 子文件夹。不要选择方案 1 的 extension，也不要选择 pip-shortcuts 外层。
3. 点扩展的“详细信息 → 扩展程序选项”，或点击工具栏扩展按钮，打开控制页。
4. 先关闭视频或其他画中画窗口。Chrome 同时只能保留一个 PiP，创建新的 PiP 可能关闭已有 PiP；扩展只能检查 windows API 暴露的窗口，不能检测所有视频 PiP。
5. 点击“启动并打开新标签页”。首次 PiP 创建需要真实点击，扩展随后打开一个原生 NTP。
6. **保留控制页**。关闭或刷新控制页、关闭 PiP、重载扩展或重启 Chrome 后，需要再次点击启动。

启动按钮禁用时先看错误信息。解决问题后，在“兼容性诊断”里点“刷新诊断并重试准备”。已有会话只能由其来源页控制，重复打开的控制页不能接管它。

自动模式仅在能安全识别和控制 PiP 的 Chrome 实现上成立。无法取得唯一窗口 ID 时会关闭刚创建的自身 PiP；最小化失败时向当前会话的来源页发出关闭请求，并显示重新启动说明；恢复失败时暂停自动控制并显示错误。来源页只关闭它持有的 Document PiP 对象，不根据窗口编号关闭其他窗口。关闭后下次启动仍需点击。没有用普通 popup 冒充成功，也没有更改 Chrome flags 或启动参数来规避限制。

## 使用与清单

每次启动 Chrome 后先初始化一次并保留控制页。之后原生“+”或 Cmd+T 创建活动 NTP 时，工具尝试恢复已有浮窗；切到普通网页、控制页或关闭活动 NTP 后尝试最小化保留。点击悬浮窗口时继续检查最近使用的 Chrome 主窗口；切到其他应用时隐藏，返回有效 NTP 时恢复。最小化或恢复后重新读取真实窗口状态，避免只依赖 update 返回的快照。不支持隐藏时关闭当前浮窗，自动恢复不再成立，需回控制页点击启动。此流程依赖实际窗口控制成功，不能用自动测试替代屏幕验收。

浮窗页面背景已设为完全透明，但 Chrome 的原生 PiP 底板仍是不透明的，本机实测仍为黑色。CSS 透明不等于整个桌面窗口透明，当前没有实现透过浮窗看见下方新标签页的效果。[Document PiP 透明窗口提案](https://github.com/WICG/document-picture-in-picture/issues/99)仍为开放的功能请求。

- 普通点击：在目标窗口的活动 NTP 中打开。
- ⌘/Ctrl 点击或中键：在同一目标窗口新增后台标签。
- Shift 点击：新增前台标签。
- 过期、失活、移窗、正在导航的目标会被拒绝，不导航来源页。
- 拖动标题栏和窗口边缘调整位置与尺寸。有效边界存到扩展 local 存储；Chrome 不允许恢复时会跳过，不保证像素位置。

默认是带编号的 40 项测试清单。第 01 项 `https://example.com/` 适合导航验收，其余站点未逐站验证。离线文字图标，无远程 favicon 请求；网格可滚动，不承诺 40 项在窄窗口一屏显示。

控制页的“管理快捷方式与备份”可编辑/粘贴 JSON，然后保存。字段格式与 `extension/shortcuts.json` 相同：`version:1`，`shortcuts` 数组，唯一 `id`，`title`，HTTP/HTTPS `url`，可选 `icon` 和六位十六进制 `color`。最多 1000 项；当前默认与自动测试覆盖 40 项。保存到扩展自己的 `storage.local`，后续优先读取已保存数据。

复制清单到剪贴板，手动保存为 JSON 即可备份和迁移。复制失败可直接全选文本框复制。没有自动写入 Downloads。编辑源码中的 shortcuts.json 不会覆盖已保存清单，需在编辑器粘贴新清单并保存。

多控制页中有一页正在运行 PiP 时，其他页不可保存清单。未启动时的清单改动广播到其他控制页，更新网格；尚未保存的编辑文本会保留。

## 权限与停止

只申请 `tabs` 和 `storage`：读取标签 URL 识别 NTP、明确导航目标；保存清单和有效边界；session 保存临时窗口 ID、token 和关系。准备快照仅存窗口 ID，不记录普通网页 URL。没有 host_permissions、content_scripts、scripting、newtab override、下载权限、系统常驻程序或企业策略。

完全停用：`chrome://extensions/` 关闭此扩展开关。移除扩展会删除它自己的存储，移除前请复制备份清单。本子文件夹仍保留。没有编辑 Chrome 用户资料文件或本项目以外的文件。

## 开发与证据

已有 Node 即可运行，不需要 npm install：

```sh
npm test --prefix pip-shortcuts
npm run check --prefix pip-shortcuts
python3 pip-shortcuts/scripts/package.py
```

若当前终端已经位于 pip-shortcuts，使用 `npm test`、`npm run check`、`python3 scripts/package.py`。

[设计](docs/design.md)、[计划](docs/plan.md)、[独立审查](validation/review.md)和[验证报告](validation/report.md)均保存在本文件夹。ZIP 包包含独立源码、测试和说明，不包含 Chrome 用户资料或个人快捷方式存储。

复测先只启用方案 3 并停用方案 1；测试方案 1 时反过来。不要同时开启两份原型后直接归因于其中一个。本轮开始时两份原型均处于停用状态，测试仅启用并重新加载方案 3，没有启用其他已关闭的扩展。

Document PiP 的置顶、首次手势与来源生命周期来自 [Chrome 官方文档](https://developer.chrome.com/docs/web-platform/document-picture-in-picture)；窗口能力见 [Windows API](https://developer.chrome.com/docs/extensions/reference/api/windows)。新增 PiP 状态限制见 [Chromium WindowsUpdateFunction](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/extensions/api/tabs/tabs_api.cc)。main 会变化，验证报告保存了相关摘录；它不能代替本机版本实测。
