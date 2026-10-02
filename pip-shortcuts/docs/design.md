# 方案 3：Document PiP 快捷方式

本子系统属于新扩展。用户已明确授权自主完成设计、开发和测试，文件改动仅限本项目。没有 Git 仓库，不创建工作树、不改动方案 1 的扩展与测试。

## 目标与选择

保留真正的 Chrome 原生 NTP，在可拖动、缩放的置顶窗口中显示额外 40 个快捷方式。采用 Document PiP 与 chrome.windows 的组合。普通 popup 无置顶保证；每次离开就销毁 PiP 会丢失重新创建所需的手势，故不作为自动模式实现。

## 生命周期

工具栏按钮打开或激活唯一的扩展来源页。用户点击来源页的“启动悬浮快捷方式”，在点击回调的第一个异步操作中调用 requestWindow。保留来源页，关闭或刷新它、关闭 PiP、停用扩展或重启后需要重新启动。

创建前后查询 windows.getAll，只接受唯一新增、alwaysOnTop、normal 窗口；可见 tab URL 只允许来源扩展页或精确的 about:blank。后者是本机 Chrome 实测暴露的 Document PiP 地址，仍要求唯一新增置顶窗口、可信来源和一次性 token。歧义或不暴露窗口时显示兼容性失败，关闭自己创建的 PiP，禁止猜测其他窗口 ID。来源消息与 session token 绑定。先在来源窗口打开 NTP，再注册会话；PiP 初始聚焦时仅预置该来源窗口的活动 NTP 目标，然后复查真实焦点。保留创建期间收到的其他应用焦点事件。session 中存储窗口关系，local 中仅存储清单和窗口边界；不持久化普通标签 URL。

后台串行调度，事件发生时增加 revision。独立保存最近使用的 Chrome 主窗口 lastMainWindowId，并在每次调度查询该窗口当前活动标签。Chrome 失焦到其他应用、PiP 获得焦点或 worker 恢复时，继续检查该主窗口，不因失焦而隐藏。切到其他 Chrome 主窗口时改为跟踪新窗口。普通网页、来源页、关闭 NTP 后已非 NTP 的活动标签或最小化主窗口时隐藏；普通“+”或 Cmd+T 新建活动 NTP 时恢复同一个 PiP，不销毁会话。pendingUrl 优先。用 state:minimized/normal 且不设置 focused:true，恢复焦点及窗口层级必须实测，不把 API 成功等同于可见性成功。

用户已接受每次启动 Chrome 初始化一次，以及关闭/离开 NTP 时最小化保留浮窗。浮窗文档使用 picture-in-picture 媒体查询取消 root、body、surface 和 grid 的背景；只影响 PiP，不把控制页也设为透明。Chrome 的原生 PiP 底板和标题栏不由 CSS 控制，本机去掉文档背景后仍显示黑色底板，不能宣称已实现透过窗口看见下方页面的纯透明效果。

隐藏/恢复请求失败则停止自动控制，提示兼容性错误，允许关闭 PiP 重新启动。保留暂停开关。来源页关闭通过 pagehide 和窗口/标签移除清理，worker 重启从 session 恢复并重新校验。无法公开控制 Spaces；全屏与多屏行为逐项记录。

## 导航与数据

普通点击显式导航最近目标窗口的活动 NTP；Cmd/Ctrl 或中键在目标窗口新增后台标签，Shift 新增前台标签。每次导航前重查标签、窗口、活动状态及 NTP，拒绝来源页、普通网页及移窗的过期目标。消息只接收本扩展来源页与有效 token，URL 只从已验证清单中查找。

默认清单复制方案 1 的 40 项，独立维护。来源页可 JSON 编辑、保存与复制导出；导入采用粘贴文本，不自动写 Downloads。最多 1000 项，HTTP/HTTPS，无账号密码，唯一 id，标题 1 至 100 字符。网格显示离线文字图标，不获取外部图标、不向 NTP 注入内容、不覆盖新标签页。

## 文件与验收

extension/core.js 纯函数；controller.js 状态与 API；worker.js 事件与鉴权；host.js 来源及 PiP DOM；host.html/styles.css 页面。tests 测试窗口误判、URL 与数据校验、导航竞态、隐藏恢复、初始化与重启。scripts/check.mjs 静态资源与权限检查。validation/report.md 记录自动检查和浏览器观察的不同证据层级。

无 npm 依赖、远程代码、主机权限、企业策略、Chrome flags 或用户资料文件编辑。权限只有 tabs、storage。Chrome 最低 130，实际运行版本另记。所有文件与打包产物只放本子文件夹。
