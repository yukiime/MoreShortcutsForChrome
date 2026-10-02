# 原生 NTP 侧边栏验证设计

> 历史 0.1.0 记录。当前 0.2.0 实现与未验收项目见 [本轮验收记录](sidepanel-improvements-validation-2026-10-03.md)。

日期：2026-10-02。依据：用户本轮完整范围与 chrome-native-ntp-feasibility.md。

本轮是可保留源码的验证原型。用户已授权先说明设计后直接实现，不采用技能默认的重复审批、路线选择或 Git 提交流程。当前目录没有 Git 仓库，也没有磁盘 AGENTS.md；适用用户消息中的中文写作规则。

扩展只有原生 NTP 旁的快捷方式网格。采用 MV3 模块 service worker、HTML/CSS/JS 与打包 JSON，不替换 NTP，不注入内容，不设置 flags。40 个入口使用圆形底和本地文字图标，不向第三方请求 favicon。

默认全局面板禁用。为识别到的 NTP 设置独立 tabId 面板，路径包含所属 tabId/windowId。工具栏用公开 setPanelBehavior 接受用户真实点击，后台不调用 open()。切换到网页时 Chrome 隐藏标签页面板；同标签离开 NTP 时先以 tabId 关闭再禁用。返回时仅注册，自动恢复依赖 Chrome，失败时点击一次工具栏。全局意外打开时按 windowId 关闭，绝不把 tabId close 当成关闭全局。

pendingUrl 非空时优先于 url，避免旧 NTP URL 导致普通网页导航期间仍可用。仅识别明确内部 NTP 别名，不把 google.com 或普通扩展新标签页认作原生 NTP。不能在公开 URL 不可见时猜测。

点击经过 worker 验证消息来源和所属窗口，使用明确 windowId 查询活动标签，还要确认其 id 与绑定的 NTP 一致。普通点击替换该 NTP，修饰键/中键在同一窗口新建标签。任何过期、移窗或非 NTP 上下文都拒绝，无焦点强制操作。

清单是 shortcuts.json，复制它或整个文件夹即可备份和迁移。storage.session 只存短期诊断，不记录普通网页完整 URL，无 storage.local 数据。单独的诊断页用于复制日志和按矩阵复测，侧边栏不添加管理功能。

先做 NTP 过渡和导航安全的 Node 测试，再交付可加载原型。真实 Chrome 验证必须在明确允许加载本地扩展之后执行。运行版本已在 chrome://version 核对为 .93，不能把它写成 .58 实测。全屏、Spaces、重启等只有实际观察才记通过。
