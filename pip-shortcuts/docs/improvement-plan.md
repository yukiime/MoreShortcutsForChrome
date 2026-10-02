# 方案 3 改进实施记录

日期：2026-10-03。用户要求自主实施方案 3；当前目录直接修改，仅修改本子文件夹。方案 1 的未提交文档保留。既有 Git 作者 Mio 保持不变。

## 本轮范围和验收边界

恢复上下文后，方案 3 是 Document PiP。最新用户反馈要求其他应用位于浮窗之上；旧实现失焦仍显示，直接导致遮挡。Document PiP 原生置顶和窗口底板由 Chrome 管理，公开 API 没有取消置顶或透明底板选项，因此本轮不把受限接口包装成已满足窗口层级及纯透明要求。

实施可运行的遮挡退路：Chrome 失焦或离开 NTP 后尝试最小化自身 PiP；状态变更后重新读取窗口，不因 update 的旧快照误报。最小化未实际生效时，来源页关闭自己的 PiP，明确说明需要重新点击启动。这个退路不能保留同一浮窗会话；恢复仍要求手势，不冒充完整自动恢复。已有错误后收到失焦事件仍必须发出关闭请求，避免错误锁定留下置顶窗口。

## 步骤

1. 先编写失败用例：外部应用焦点隐藏、返回主窗口恢复、API 返回快照与实际状态差异、隐藏失败后关闭自己、过期状态不得关闭新会话。
2. 修改 controller 的显示条件、读取结果与关闭请求，host 的关闭处理及状态说明。权限不增加。
3. 自动测试、静态检查、方案 1 回归；单独启用方案 3 浏览器实测，最后恢复扩展开关初始状态。
4. 独立审查、修复实质问题、更新说明、打包、以本地用户 Git 身份提交。

## 进度

- 基线：62/62 子项目测试通过；方案 1 初始启用，方案 3 初始停用。
- 实施：外部焦点隐藏、实时状态复查、自身关闭请求及 host 的 token 校验已实现。11 个用例先失败，71/71 子项目测试与方案 1 的 15/15 回归通过，两份静态检查通过。
- 浏览器：0.1.2 加载和 40 项真实 PiP 通过。后续外部应用焦点验证遇到 Mac 锁屏；关闭、恢复和 UI 收尾未验收。最后确认方案 1 停用、方案 3 启用，测试窗口需解锁后清理。
- Ruling：以失焦隐藏及隐藏失败后关闭作为遮挡退路。代价是浮窗不能保持在其他应用下方，Chrome 拒绝隐藏时必须手动重新创建；完整目标仍未完成。

- Final: fixed 短暂失焦误关：两项焦点回归 RED→GREEN。fixed 恢复错误后关闭状态不实：一项状态回归 RED→GREEN。完整测试 71/71，未遗留 Minor。
- 最新用户明确接受：无法实现其他应用覆盖浮窗时，回退为其他应用获得焦点后隐藏。启动二级跳转需要继续研究，尚未完成。

## 最高优先级：消除启动二级跳转

用户明确启动问题优先于窗口层级。0.2.0 改为工具栏单击直接打开原生 NTP 和浮窗，用户无需先打开控制标签页，再点击第二个启动按钮。

扩展自动准备普通后台 source.html 标签。DOM 模板、消息监听器都就绪后，以 source-ready 握手启用工具栏按钮；准备期间禁用。工具栏 action 的第一层 runtime.getContexts 回调检查 TAB 类型、来源 URL、tabId、documentId，直接发送点击激活。真实来源标签直接 requestWindow，不做中继。这个标签需要保留，但不会被自动激活，管理页可以关闭。

## 被审查否决的候选

最初尝试隐藏 offscreen 文档持有 PiP，模块测试通过但精确 Chromium 154 原生链无法工作：ExtensionHost delegate 丢失来源 WebContents，NavigateParams source_contents 为空，浏览器在补填来源之前拒绝 Document PiP。该候选没有作为可运行版本提交。

随后核对 offscreen 激活中继：renderer 消息只在激活非 restricted 时转发 user_gesture，而扩展消息激活属于 restricted，故中继不能完成。最终移除 offscreen 文档及权限，保留只用 tabs/storage 的后台来源路径。

## 最终实现与验收边界

- 预先准备不激活的 source 标签，仅就绪后 enable action。扩展启动、来源关闭和普通窗口创建均检查来源生命周期。
- action 第一层原生 callback 直接发 launch，没有 await、查询清单或其他 API 中继。
- begin 固定本次点击所属窗口，窗口发现后重验 ticket；register/reuse 提交时消费 ticket。变更消息串行化，避免重复注册；迟到的早期结果不能覆盖新错误。
- controller 通过 TAB context、tabId、documentId、URL 验证来源，worker 重启后只恢复同一文档；来源刷新后旧会话清除。
- 复用会话时先打开 NTP，再处理显示；暂停的恢复错误允许重新尝试，真实失败或自动关闭必须报错，不能清除错误标记后冒充成功。
- 启动前检查 renderer 真实激活，超时失败且不创建 PiP。失败时仅关闭本次创建的 Window 对象；不会跳到管理页。
- 工具栏错误标记及管理页诊断保留可复核原因。普通管理页可以编辑后台会话的清单。
- 真实待验收：重载 0.2.0、首次后台准备、单击首次启动、没有前台控制页跳转、重复点击、关闭后重启、多 Chrome 窗口、其他应用失焦退路及浏览器收尾。锁屏前加载的是 0.1.2 的早期修复，不是最终 0.2.0。

## 精确源码依据

Revision a654841425914cbb703a2931e07b70a83aedbafd：[第一层 API 交互回调](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/extensions/renderer/bindings/api_request_handler.cc)、[消息激活](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/extensions/renderer/api/messaging/native_renderer_messaging_service.cc)、[PiP 手势检查](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/third_party/blink/renderer/modules/document_picture_in_picture/picture_in_picture_controller_impl.cc)。

否决证据：[ExtensionHost delegate](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/extensions/chrome_extension_host_delegate.cc)、[browser navigator 的来源拒绝点](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/chrome/browser/ui/navigator/browser_navigator.cc)、[renderer 的转发限制](https://github.com/chromium/chromium/blob/a654841425914cbb703a2931e07b70a83aedbafd/extensions/renderer/api/messaging/messaging_util.cc)。源码可行性不能替代本机屏幕验收。

## 最终检查与独立审查

- 92/92 子项目测试、方案 1 的 15/15 回归及两份静态检查通过，git diff --check 通过。
- Final: fixed 来源生命周期缺失：来源导航及坏来源恢复两项回归先失败再通过；刷新/loading 禁用 action，完成后重新握手；已有完整来源不响应仅重载一次，不无限重试。
- Final: fixed 首次注册错误仍成功：缺失状态、恢复错误、异步关闭请求三种变体先失败再通过；注册和复用均拒绝错误、暂停及关闭请求。只关闭本次持有对象一次。
- 独立审查未发现最终普通来源路径的原生 API 阻断，全部实质发现已处理；没有以自动测试替代屏幕验收。
- 程序、测试、设计及说明单独以 Mio 身份提交；方案 1 的未提交文档保持原状。0.2.0 为待本机验收的实验版，保留 a9d7eec 的遮挡回退提交作为可追溯基线。
