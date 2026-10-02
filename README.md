# 原生 NTP 额外快捷方式：侧边栏验证原型

保留 Chrome 真正的新标签页，额外 40 个入口放在 Chrome 管理的标签页侧边栏。无构建、无 npm 安装、无远程脚本或图标请求。这里只是方案 1 的验证原型，未实施 Document PiP。

用户原生个人快捷方式默认是 **10 个**；用户已手动开启 `ntp-shortcuts-redesign` 后才是 **20 个**。扩展的 40 个入口是独立清单，与原生数量无关。

## 加载与首次打开

1. 保留整个文件夹，ZIP 用户先解压。
2. 用 Chrome 打开 `chrome://extensions`，开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本项目的 **extension 文件夹**，其中直接包含 manifest.json。
4. 新建原生新标签页。等待片刻，让后台注册该标签页面板。
5. 点工具栏“扩展程序”，固定“原生 NTP 额外快捷方式（侧边栏原型）”。
6. 点一次固定按钮。首次打开需要这个用户手势；后台不会自行调用 open()。

最低接口版本为 Chrome 145。macOS 本机已核对运行版本为 Chrome 154.0.8037.93 arm64，**不是目标 .58**。详细实测状态见 [验证报告](validation/report.md)，不能将接口最低版本或静态检查当成其他平台实测。

如果工具栏按钮灰色，请确认当前是原生 NTP，重新切换一次标签页。若无响应，检查扩展卡片“错误”，点重新加载后再打开 NTP。侧边栏关闭后可在 NTP 再点一次按钮恢复。

## 使用与容量

侧边栏只有按钮网格。40 个带编号入口用于清楚识别换行和第 40 项，长标题单行省略，悬停显示完整标题和 URL。圆形底 48px、文字图标、12px 标题和 104px 单元高度接近原生入口，不宣称像素一致。文字图标是离线占位图标，未申请 favicon 或主机访问权限。

普通点击在**该侧边栏所属窗口的活动 NTP 标签**打开网址，已通过两窗口实测。代码支持 ⌘/Ctrl 点击或中键在同一窗口新增后台标签，Shift 点击新增前台标签；工具未确认真实中键/修饰键送达，这几种输入仍需人工复测。面板本身不会导航。面板已过期、标签已移窗、已不活动或正离开 NTP 时拒绝导航并显示简短错误。无自动 focus、无窗口激活循环。

JSON 条目本身尚未逐站检查可访问性。导航测试优先使用“01 示例页面” https://example.com/，避免登录和复杂站点影响生命周期观察。测试网格是可滚动的 40 项，不承诺窄面板能在一屏同时放下 40 项。

## 自动显示的实际边界

默认全局面板禁用，NTP 才启用独立 tabId 面板。工具栏使用 `setPanelBehavior({openPanelOnActionClick:true})`，由 Chrome 处理真实点击；`setOptions({enabled:true})` 仅注册，不能打开面板。

本机 Chrome .93 初轮实测：切到普通网页隐藏面板，切回已打开过的 NTP 自动恢复。新建 NTP、手动关闭后、同一标签导航再返回、重新启用和重新加载后都没有自动打开，进入 NTP **点击一次工具栏按钮可恢复**。收尾旧标签另有后退 NTP 持续空白异常，停用扩展后仍未恢复，新建 NTP 正常，根因未定位；不能称稳定性验收完成。浏览器重启未测，其他版本需复验。不能声称“只需终身点击一次”。

同一标签离开 NTP 时用 `close({tabId})` 关闭标签页面板，再禁用它。程序不主动打开全局面板；若收到无 tabId 的意外全局打开事件，用 `close({windowId})` 关闭全局面板。Chrome 145 起 tabId close 不再代替关闭全局面板。[官方 Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

pendingUrl 非空时优先用于判断，避免导航过渡残留。识别 `chrome://newtab/`、`chrome://new-tab-page/`、`chrome://new-tab-page-third-party/`、`chrome-search://local-ntp/local-ntp.html`。后几个是待实测别名。google.com、普通扩展页面、about:blank 和未知 URL 都不算 NTP。公开接口观察不到的页面状态不会被猜测。

worker 每次启动查询标签并重新核对配置，不依赖内存记录“是否打开过”。浏览器自己的面板历史由 Chrome 管理，扩展没有读写该历史的公开能力。初始化短暂延迟期间按钮可能尚未就绪。

## 权限、停用和迁移

| 权限 | 用途 |
|---|---|
| sidePanel | 注册标签页面板，设置真实工具栏点击行为，记录开关事件、读取左右布局、关闭指定面板 |
| tabs | 读取 url/pendingUrl 识别原生 NTP，确定明确窗口中的目标标签。该权限可读取标签 URL，但代码不读页面内容，不持久化普通网页完整 URL |
| storage | 仅用 storage.session 保存最近 120 条诊断事件，不使用 storage.local 或 sync |

[Tabs API 权限说明](https://developer.chrome.com/docs/extensions/reference/api/tabs)；[Storage API 说明](https://developer.chrome.com/docs/extensions/reference/api/storage)。没有主机权限、content_scripts、scripting、newtab override、popup、企业策略或配置描述文件。

停用：`chrome://extensions` 关闭扩展开关。重新启用后进入 NTP，必要时点一次工具栏按钮。移除会移除扩展自己的临时状态，清单文件仍保留在磁盘。

备份与迁移：入口保存在 **extension/shortcuts.json**。复制此文件或整个源码文件夹即可；ZIP 分享也包含它。换机器后用同样方式加载 extension。修改清单后在扩展卡片点重新加载，已打开面板也重新打开。清单修改无需开发环境。字段见文件示例，version 固定 1，id 唯一，URL 只允许无账号密码的 HTTP/HTTPS。代码校验上限 1000，当前只验证 40。

session 诊断在扩展停用、重新加载、更新或 Chrome 重启后清空，不是用户快捷方式备份。ZIP 不包含 Chrome 用户资料。

## 复测与开发

扩展卡片“详细信息”中的“扩展程序选项”打开独立诊断页。刷新和复制 JSON 可取得注册、open/close、导航与 worker-ready 事件。该日志不能证明可见性或焦点，不要用 API 事件取代人工观察。onClosed 也不能独自判定“用户关闭”还是 Chrome 导航关闭。

[验证报告](validation/report.md) 提供完整验收矩阵及最短复现步骤。重启测试前保存重要浏览器工作；本轮不自动关闭用户现有会话。

开发检查仅需已有 Node，加载扩展不需要它：

```sh
npm test
npm run check
python3 scripts/package.py
```

目录：extension 为可加载源码；tests 为业务与 API 边界测试；scripts 为检查、图标生成和打包；docs 为设计和工作记录；validation 为证据与未测项目。

已知取舍：位置在 Chrome 左右侧栏，缩小 NTP 横向空间，不能放到原生图标下方；文字图标暂非真实站点 favicon；没有编辑器、拖拽和分类。本轮已验证宽面板 40 项、输入、账号菜单、全屏跟随、两窗口、重载和自然休眠恢复；窄面板、独立 Spaces、左侧和 Chrome 重启仍未完成实测，后退空白异常仍需定位。未来原生 NTP 功能仍由 Chrome 提供，扩展对未来版本的兼容性需要复验。
