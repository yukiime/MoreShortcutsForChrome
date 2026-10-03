# 归档：Document PiP 快捷方式原型

此目录保留早期方案源码和测试，已停止作为主实现开发。当前产品请加载仓库根目录的 `extension/`，见 [主项目说明](../../README.md)。以下为原型使用说明，不代表当前产品的状态。

独立的 Chrome 扩展。保留真正的原生新标签页，把额外 40 个入口放在 Document PiP 浮窗中；与外层侧边栏方案 1 分别加载。

**当前 0.2.0 是单击启动实验版，浏览器验收尚未完成。** 工具栏按钮改为直接启动浮窗并打开原生新标签页，不再先打开控制标签页。扩展自动准备一个不激活的后台会话标签来持有浮窗，这个后台标签需要保留，管理页可以关闭。自动测试已覆盖启动、复用、会话身份、并发和失败清理，但本机测试期间 Mac 锁屏，尚不能确认本机单击启动及窗口焦点的实际效果。详细边界见 [改进记录](docs/improvement-plan.md)。

## 加载与启动

1. 在 `chrome://extensions/` 开启开发者模式，加载本文件夹内的 **extension** 子文件夹。已加载的旧版需重新加载。不要选择外层方案 1 的 extension。
2. 先关闭视频或其他画中画窗口，避免 Chrome 创建新 PiP 时替换已有窗口。
3. 在普通 Chrome 窗口中，**点击一次工具栏扩展按钮**。预期直接打开原生新标签页和浮窗；不打开控制页。
4. 等待后台会话标签准备完成，工具栏按钮才会启用。再次点击按钮复用当前浮窗，并在点击所属窗口打开新标签页。关闭浮窗、重载扩展或重启 Chrome 后，再次点击启动。

启动失败时按钮显示 `!`，悬停可看错误。也可在“详细信息 → 扩展程序选项”打开管理页，刷新诊断查看错误。失败不会自动跳到控制页。管理页保留“手动测试”入口，仅这个旧测试模式需要保留来源标签页；它不代表单击启动验收通过。

## 显示与使用

在原生 NTP 上显示；离开、关闭 NTP 或切到其他应用时尝试最小化；返回有效 NTP 时尝试恢复。更新后重新读取窗口状态。如果 Chrome 无法隐藏，持有浮窗的文档关闭自己的 Window 对象，避免继续遮挡，再点工具栏按钮重新启动。不会根据猜测的窗口编号关闭其他窗口。

用户期望的“其他应用 → 浮窗 → Chrome”窗口层级尚未实现，当前采用已获授权的失焦隐藏退路。Chrome 原生 PiP 底板仍不透明；CSS 透明不能实现整个桌面窗口透明。隐藏失败后的关闭和恢复效果同样需要屏幕验收。

- 普通点击：在目标窗口的活动 NTP 中打开。
- ⌘/Ctrl 点击或中键：在同一窗口新增后台标签。
- Shift 点击：新增前台标签。
- 过期、失活、移窗或正在导航的目标被拒绝。
- 拖动标题栏和边缘调整位置、尺寸。有效边界存到扩展 local 存储，不保证 Chrome 允许精确恢复。

后台来源标签不会被自动切到前台。关闭它会关闭当前浮窗，并重新准备后台来源。首次加载会多出这个标签，这是避免手动二级跳转的代价。

默认是带编号的 40 项测试清单，第 01 项 `https://example.com/` 可用于导航验收。使用离线文字图标，不请求远程 favicon；窄窗口可以滚动。

## 清单与权限

管理页可编辑、粘贴、保存或复制 JSON。格式同 `extension/shortcuts.json`：`version:1`、`shortcuts` 数组，唯一 `id`、`title`、无账号密码的 HTTP/HTTPS `url`，可选 `icon` 和六位十六进制 `color`。最多 1000 项。保存到本扩展自己的 `storage.local`，不会修改原生快捷方式。复制后手动保存 JSON 即可备份；修改默认源码不会覆盖已保存清单。

只申请两个权限：`tabs` 识别 NTP 和导航；`storage` 保存清单、边界及临时会话。后台来源标签负责持有实际 PiP Window，窗口控制留在 worker。没有 debugger、host_permissions、content_scripts、scripting、newtab override、系统常驻程序或企业策略。诊断只存窗口结构和 URL 类别，不存普通网页地址。

在 `chrome://extensions/` 关闭开关即可完全停用。移除前复制清单备份；移除会删除扩展自己的存储。

## 开发与记录

无需 npm install，已有 Node 和 Python 即可运行：

```sh
npm test --prefix archive/pip-shortcuts
npm run check --prefix archive/pip-shortcuts
python3 archive/pip-shortcuts/scripts/package.py
```

若终端已在 pip-shortcuts 中，省略前缀。ZIP 包包含独立源码、测试和说明，不含 Chrome 用户资料或个人存储。

此目录的开发历史保留在 Git 记录中。

[设计](docs/design.md)和[实施记录](docs/improvement-plan.md)保留原方案决策。原始本机验证报告仅保存在 Git 忽略的 `.local/` 中，不随公开源码分发。

原生能力参考 [Chrome Document PiP](https://developer.chrome.com/docs/web-platform/document-picture-in-picture/) 和 [windows API](https://developer.chrome.com/docs/extensions/reference/api/windows)。单击激活的推导来自 Chromium 154 对应源码，不能代替本机运行结果。
