# 架构

扩展采用 MV3 模块 service worker 和原生 HTML/CSS/JavaScript。全局侧栏默认禁用，为符合条件的原生 NTP 注册包含 tabId/windowId 的独立面板路径。

| 文件 | 职责 |
| --- | --- |
| `extension/worker.js` | 同步注册事件监听器，初始化服务并分派消息 |
| `extension/core.js` | NTP 识别、清单与网址校验、面板上下文解析 |
| `extension/controller.js` | 逐标签队列、侧栏注册与隐藏、安全导航 |
| `extension/entry.js` | 在用户操作回调中创建 NTP 并打开对应侧栏 |
| `extension/shortcut-store.js` | 本地清单与设置、revision 冲突保护、写入队列 |
| `extension/panel-service.js` | 面板消息、历史查询、上下文校验与令牌失效 |
| `extension/panel-ui.js` | 编辑草稿、保存锁定、持久开关与二级菜单 |
| `extension/frequent-sites.js` | 有界历史扫描和 hostname 排名 |
| `extension/auto-open.js` | 自动显示队列、自有调试目标、手势桥接与清理 |
| `extension/offscreen-client.js` | 隐藏文档创建与排名请求 |
| `extension/offscreen.js`、`rank-worker.js` | 手势消息桥接与本地排名 Worker |

后台验证每次请求的发送者身份、面板路径、活动 NTP 与明确窗口。`pendingUrl` 优先于已提交 URL，防止页面开始离开 NTP 后仍接受旧导航。

快捷方式与设置存储在 `storage.local`；短期诊断存储在 `storage.session`。历史结果和导航令牌仅在内存中存在。后台不依赖常驻 timer 或 port 维持运行。

Node 测试使用真实业务模块和 Chrome API 边界替身。浏览器手势、提示、焦点和可见性不由 API 替身证明，见 [验证记录](validation.md)。
