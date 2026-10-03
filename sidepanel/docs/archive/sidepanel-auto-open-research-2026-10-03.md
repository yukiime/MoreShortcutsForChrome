# 方案 1 改进：原生自动显示与 Command+T 入口

> 研究归档。当前 0.3.0 已升级原扩展并在本机 Chrome 154 实测通过原生“+”自动显示；实现、代价及剩余未测项见 [本轮验收记录](../validation.md)。

研究日期：2026-10-03，Asia/Tokyo。三名 Agent 分别审查侧栏状态、手势替代路径、编辑与历史功能；主 Agent 另行核查 macOS 快捷键分发。此文件是可行性研究和改进建议，不是新功能已实现或浏览器验收通过的声明。

## 结论与建议

此前把无手势的 tabs 事件推广为“所有纯扩展组合均不可行”，判断范围过大。本轮找到两条不同路线：

1. **优先验证用户手动绑定 Command+T 的单扩展入口。** 在 Chrome 自带的扩展快捷键设置中绑定命令；命令直接创建真实 NTP，并打开该 tabId 的独立侧栏。复用原扩展的工具栏按钮，不安装第二个扩展，不使用辅助应用，不经过控制标签页，不让侧栏出现在普通网页。源码支持这条组合，但创建、注册、打开的时序及真实 Command+T 效果尚未实测。
2. **继续保留原生“+”自动显示的纯扩展实验候选。** 本扩展的隐藏 offscreen 文档、debugger 的临时激活和扩展消息相配合，源码形成一条可传递手势的链。代价是必需 debugger 权限，以及所有 Chrome 窗口可见的调试提示。不能把它包装成无代价、稳定受支持的自动侧栏接口，也不能在未实测时宣称完全满足要求。

用户最初要求的“原生 + / Command+T 自动显示、普通网页隐藏、单扩展、无外部应用”仍未通过运行验收。下面明确哪些已有源码证据，哪些仍是假设。

## 固定要求

- Chrome 真正的原生新标签页保留，不用 newtab override 复制页面。
- 全局侧栏保持禁用，只有 NTP 的逐标签侧栏可以启用。普通网页不显示本扩展侧栏。
- 一个扩展完成全部功能；不依赖常驻辅助程序、其他应用、系统按键重映射工具或额外浮窗。
- 编辑名称和 URL 的界面位于侧栏内，保存后持久生效。
- “常访问”作为二级区域，按明确的历史统计口径展示最多 20 个网站；保留已经批准的持久开关。
- 用户最新允许原生自动方式实在不能满足时，复用扩展按钮或调整 Command+T。它们必须明确标为退路，不能称为原生“+”自动显示。

## 直接监听原生新标签页为什么不够

`tabs.onCreated` / `onUpdated` 派发给扩展时没有用户手势，`sidePanel.open()` 会检查调用的手势。因此，在创建事件里调用 open、删除 await、改为定时器或 DOM 的 `.click()`，都不能自行产生有效激活。

`setOptions({enabled:true})` 注册可用条目，不等于主动打开。已打开过的 NTP 可以恢复，不代表刚创建的另一个 NTP 有同样的打开记录。

全局与逐标签配置也不能混用来掩盖问题。Chrome 131 的变更禁止了“注册新的逐标签条目时，由已经打开的全局面板立即带出”的行为；但精确 154 源码仍支持某些切换标签时的同 key 状态选择。因此“逐标签状态永远不继承全局”也不准确。决定性的约束是：普通网页没有相应逐标签面板时会回退到全局面板；逐标签 `enabled:false` 不会禁用全局面板。用户已经拒绝这项取舍。

来源：[Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)、[154 侧栏 API](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/extensions/api/side_panel/side_panel_api.cc)、[154 标签事件](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/extensions/api/tabs/tabs_event_router.cc)、[131 变更](https://chromium.googlesource.com/chromium/src/+/6dd962b30f8540dcbdd48a31e5b51f788924ff21%5E!/)。

## Command+T 退路的完整依据

不能只在 manifest 中写 `suggested_key: Command+T`，然后假设安装后自动接管。`CommandService::CanAutoAssign()` 明确排除 Chrome 已有快捷键。

但用户通过 `chrome://extensions/shortcuts` 手动更改时，界面调用 `developerPrivate.updateExtensionCommand`，继而进入 `UpdateKeybindingPrefs()`。这条路径允许用户覆盖已有绑定，没有再调用上述默认分配过滤。快捷键输入组件接受 Command 修饰键与 T 字母，没有针对 Command+T 的禁止分支。

在 macOS，`ChromeCommandDispatcherDelegate::prePerformKeyEquivalent()` 先把按键交给高优先级 Views accelerator，再处理 Chrome 原生命令。扩展命令注册为高优先级；`commands.onCommand` 明确携带用户手势。这比泛泛引用“某些 Chrome 快捷键不能覆盖”更能说明此处的实际路径。

官方浏览器测试已有用户手动覆盖 Command+P、Command+D 的案例，包含地址栏聚焦场景。它们证明手动覆盖机制确实存在，但不是本轮 Command+T 的运行证据。

拟定入口行为：

- 声明一个有名称的 `new-ntp-with-panel` 命令，同步注册 `commands.onCommand` 监听器。
- 用户在 Chrome 自带的快捷键页面把该命令设为 Command+T，作用范围为 Chrome 内；不需要 macOS 设置或其他应用。
- 将原有扩展工具栏按钮复用为同一个“新标签页与快捷方式”入口，不增加第二个按钮或第二个扩展。
- 复用按钮时关闭现有 `openPanelOnActionClick` 自动切换行为，并让普通网页上的 action 也可点击；当前控制器禁用普通网页按钮的规则必须相应调整。按钮可用不等于普通网页启用侧栏。
- 两个入口都在明确的宿主窗口创建 `chrome://newtab/`，注册带 tabId/windowId 的逐标签面板，再打开它。普通“+”仍维持原生行为，除非另行启用并验证下面的自动候选。
- 解绑命令或停用扩展后，原生命令应恢复，必须实测此恢复路径。

来源：[Commands API](https://developer.chrome.com/docs/extensions/reference/api/commands)、[154 CommandService](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/extensions/commands/command_service.cc)、[154 设置界面后台](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/extensions/api/developer_private/developer_private_functions.cc)、[154 macOS 按键分发](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/ui/cocoa/chrome_command_dispatcher_delegate.mm)、[154 优先级](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/ui/extensions/accelerator_priority.h)、[官方覆盖测试](https://chromium.googlesource.com/chromium/src/+/refs/tags/136.0.7056.0/chrome/browser/extensions/extension_keybinding_apitest.cc)。

### 一次点击创建与打开的时序

不能未经验证就连续 `await tabs.create()`、`await setOptions()`、`await open()`。精确 154 的 `ExtensionInteractionProvider` 只为原始 worker interaction 创建回调 token，不从一个已恢复的 token 再生成新 token；因此连续多层 API 回调可能失去手势。

值得验证的结构是：真实 action/command listener 直接调用 `tabs.create`，不先经过现有 `run()`、`ready.then()`、初始化 await 或异步队列；在这个 API 的同一个原生 callback 内，直接发出 `setOptions` 和 `open`，不等待 setOptions 的第二层回调。setOptions 在浏览器进程同步处理；仍需实测两个请求按预期顺序到达，以及冷启动初始化不会覆盖刚注册的配置。

这不是用一个 Promise 的成功值证明面板可见。必须同时核对原生 NTP、40 项侧栏、窗口归属和普通网页隐藏。

来源：[154 worker interaction](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/extensions/renderer/extension_interaction_provider.cc)、[154 API request handler](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/extensions/renderer/bindings/api_request_handler.cc)。

### 按钮位置的真实边界

Chrome 的 extension action 按钮在地址栏旁的工具栏。公开 Action API 没有把扩展按钮放进原生标签条、贴在“+”旁的布局接口。因此源码支持把单扩展按钮设计为“一击创建并开侧栏”，但不能承诺用户指定的“+”旁位置。复用现有按钮能避免再增加一枚图标。

来源：[Action API](https://developer.chrome.com/docs/extensions/reference/api/action)、[Chrome 扩展 UI 能力](https://developer.chrome.com/docs/extensions/develop)。

## 原生“+”自动显示的隐藏文档候选

源码支持下面的组合，尚未运行验收：

1. 保持全局面板禁用；后台在 NTP 创建、激活及导航事件中先完成逐标签配置。
2. 使用本扩展包内的 offscreen 文档，不增加可见控制标签页、不导航原生 NTP、不创建辅助窗口。
3. `debugger.getTargets()` 定位自己的 offscreen 文档；只向该 targetId 附着，不调试用户网站或 Chrome 内部页。
4. `Runtime.evaluate` 的 `userGesture:true` 让该文档的 LocalFrame 获得临时 DevTools 激活；文档立即 `runtime.sendMessage` 回自己的 worker。
5. 消息在 worker 中恢复有效的 interaction；带请求标识核对目标 NTP 后，在仍有有效手势的回调内 `sidePanel.open({tabId})`。配置和可提前完成的校验应先完成；若需重新读取标签，只经过一次原生 `tabs.get` callback 并在其中直接 open，不能先走 ready.then、多次 await 或第二层 API callback。
6. 成功或失败都断开调试。离开 NTP 时关闭并禁用对应逐标签面板。关闭自动模式或撤销扩展权限时停止这条触发链。

offscreen 文档只有 runtime 扩展 API，不能直接在其中调用 sidePanel。直接在自己的 service worker 中 evaluate userGesture 也没有对应 DOMWindow/LocalFrame，不能用来代替这条消息桥。

本轮两名 Agent 独立核对的关键链：CDP evaluate 的模拟手势进入 Blink 的 `ThreadDebuggerCommonImpl::beginUserGesture()`，以 `kDevTools` 激活 frame；这类激活不属于 extension messaging 的受限激活。renderer 的消息发送携带有效手势，worker 的消息递送建立 `Scope::ForWorker`。

精确 154 将 offscreen target 临时归类为 background_page，但 `{targetId}` 附着路径并未套用“传 extensionId 调试背景页需要特殊启动参数”的文档描述。target 枚举与附着的后续权限检查仍须以实测为准，不能从目标能被列出就宣称附着必定成功。

### 必须明示的代价

- **debugger 是必需权限，不能列在 optional_permissions。** 不能把自动模式设计成首次使用时才申请 debugger 的轻权限选项。新安装或更新会涉及该权限；history 仍可独立保持可选。
- Chrome 对该权限的提示包括访问页面调试后端，以及读取和更改所有网站数据。即使实现只选择自己的隐藏文档，授权范围仍然较大，必须如实告知。
- 调试提示是 Chrome 的全局 UI，会显示在其他 Chrome 窗口。它不等于侧栏在其他窗口常驻，但可能影响用户对界面的接受程度。
- 最后一个调试会话断开后，源码保留提示约 5 秒。快速连续新建标签页可能使提示持续。不能承诺即时消失，也不提出隐藏提示的启动参数。
- offscreen 需要真实、合法的创建理由。若采用 WORKERS，应真实承载历史排名的 WebWorker 计算；不能只写与页面实际用途无关的理由。
- 该组合借助调试能力产生激活，不是 Side Panel API 承诺的原生自动打开机制。Chrome 更新、调试策略、target 附着失败、用户取消调试都可能使它失效。
- 必须处理多窗口、快速切换、旧请求、worker 休眠与 offscreen 重建；调试链失败时保留 NTP、给出可操作错误，不能转开全局侧栏。

来源：[Debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)、[Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)、[Permissions API 不可选权限](https://developer.chrome.com/docs/extensions/reference/api/permissions)、[官方权限提示](https://developer.chrome.com/docs/extensions/reference/permissions-list)、[154 附着与枚举](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/extensions/api/debugger/debugger_api.cc)、[154 提示时长](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/extensions/api/debugger/extension_dev_tools_infobar_delegate.h#L30)、[154 全局提示生命周期](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/extensions/api/debugger/extension_dev_tools_infobar_delegate.cc)、[154 offscreen target 类型](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/devtools/chrome_devtools_manager_delegate.cc)、[154 Blink 手势入口](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/third_party/blink/renderer/core/inspector/thread_debugger_common_impl.cc)、[154 renderer 消息](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/extensions/renderer/api/messaging/native_renderer_messaging_service.cc)。

## 其余路径的审视结果

| 路径 | 判断 |
|---|---|
| 无手势 tabs 事件直接 open | 源码拒绝，删除 await 不能改变事件标记 |
| 全局打开，普通页 tab enabled:false | 普通页仍可能回退全局，违反 NTP 独占 |
| 相同 HTML path 共享逐标签实例 | API 明确为不同实例，不能据此复制打开记录 |
| 自动 action.openPopup 后脚本直接 open | 打开 popup 的调用本身不等于 renderer 获得真实手势，尚无来源证明这条简单链有效 |
| DOM .click()/dispatchEvent | 不能自行产生可信临时激活 |
| debugger 直接附着原生 NTP | 内部页面访问受限制，也没有必要；候选只附着自己的文档 |
| 新标签页 override 或嵌套原生页 | 不保留用户要求的真实原生 NTP，排除 |
| 复用一个已有 NTP 标签 | 不是新建标签页，改变标签语义，排除 |
| 外部按键工具、系统辅助应用、独立浮窗 | 用户拒绝，排除 |

## 两个侧栏功能的具体实现

**直接编辑。** 保留网格，进入编辑模式后点击条目，侧栏内显示名称、URL、保存和取消；不跳往 options 页。支持省略协议的域名，规范化为 HTTPS，只接纳无账号密码的 HTTP/HTTPS。保存到 storage.local，保留 id、顺序和图标。后台唯一写入、单队列、revision 比较；保存失败保留草稿，另一面板的旧版本不能覆盖新数据。

**常访问二级区域。** 保留已批准的默认关闭持久开关。开启后随侧栏显示榜单，仍保留自定义网格；提供临时收起和刷新。首次读历史由侧栏内真实按钮申请可选 history 权限。按 Chrome History API 返回的各 URL visitCount 汇总 hostname，HTTP/HTTPS 合并，子域分开；降序取 20，不足显示实际数量。这不是 Chrome 内部推荐榜单，也不是去重后的访问会话数。

`topSites.get()` 不允许指定 20 项，不能把返回列表截成 20 就承诺历史足够时一定显示 20 项。历史查询也不能取最近 20 个 URL 当排名。

旧计划的一次 `maxResults:2147483647` 应改为有界结果、触上限时拆分时间窗、按 URL/id 全局去重的完整查询；固定查询截止时间。不能用返回 lastVisitTime 直接递减分页，因为时间窗匹配访问记录，返回时间却来自 URL 的整体记录。不能完整计算时明确报错，避免把截断榜单伪装成全量统计。

编辑、设置和历史请求共享活动 NTP、窗口归属、pendingUrl 的上下文校验；只解析 sender.url 的 tabId/windowId 不够。关闭开关、撤销权限或删除历史时，清空列表并使在途请求与导航 token 失效。

来源：[已批准功能设计](sidepanel-editing-and-frequent-sites-proposal.md)、[History API](https://developer.chrome.com/docs/extensions/reference/api/history)、[Top Sites API](https://developer.chrome.com/docs/extensions/reference/api/topSites)、[Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)。

## 验证顺序与通过标准

先用最小原型验证入口，不应在入口尚未确定时把两个功能全量并入并声称自动显示已解决。

1. 手动 Command+T 绑定：普通网页、NTP、地址栏聚焦各按一次，确认只创建一个真实 NTP，侧栏属于新 tabId，没有打印界面或额外旧行为；清除绑定、停用扩展后核对恢复。
2. 工具栏同一入口：一次点击直接创建与打开；核对 API callback 手势、请求顺序及 worker 冷启动，不采用二次点击或中转页掩盖失败。
3. 原生“+”实验：只调试自己的 offscreen target；确认附着、临时激活、消息传递与 open 均成功，再观察原生 NTP 和侧栏确实共存；记录调试提示的真实范围与时长。
4. 任一路线都需核对切至普通网页后侧栏隐藏、两窗口归属、快速重复创建、手动关闭、移窗、同标签离开与返回、重载、休眠和全屏。重启测试需保留用户工作。
5. 入口达到目标后，实施并验证编辑持久保存、冲突、URL 校验、最多 20 网站的排名、权限拒绝/撤销、删除历史和失败状态。

本轮没有修改 extension 产品代码、没有给现有扩展加入 debugger 权限、没有修改用户 Command+T，也没有加载新原型。源码核查不能代替以上可见 UI 验证。
