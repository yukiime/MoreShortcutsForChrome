# 方案 1 自动显示：可行性核对

日期：2026-10-02，Asia/Tokyo。

**2026-10-03 更新：** 当前产品 0.3.0 已获用户授权将 debugger/offscreen 加入现有扩展，并在本机 Chrome 154 验证原生“+”自动打开逐标签侧栏。工具栏与手动 Command+T 入口继续可用。自动显示仍属于依赖调试能力的实验，开关默认关闭，本机已开启。见 [本轮验收记录](../validation.md) 和 [完整改进研究](sidepanel-auto-open-research-2026-10-03.md)。下文保留旧轮记录。

用户已选择转回方案 1。目标是普通“+”或 Cmd+T 打开 Chrome 原生新标签页后，直接显示额外快捷方式侧栏，不经过扩展控制标签页。方案 3 在其他应用上方置顶遮挡内容，不符合用户要求的“其他应用、浮窗、Chrome”窗口顺序，停止作为当前实现方向。

## 已确认的原因与接口边界

当前 0.1.0 在 extension/controller.js 的 initialize 中禁用全局侧栏，为每个 NTP 注册独立 tabId/path。因此新标签页没有继承旧标签页的打开状态。此前单扩展实测已确认：新 NTP 需一次工具栏点击；方案 1 的这个入口本身不需要扩展控制标签页。

[官方 Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)将注册与打开分开：setOptions 配置可用性，open 要求用户操作；已经打开的全局侧栏支持跨标签保留。浏览器“新标签页已创建”通知不能替代扩展点击的用户手势。[Chromium open 实现](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/extensions/api/side_panel/side_panel_api.cc)在执行窗口/标签选择前检查 user_gesture。

[Chrome 131 行为公告](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/uqdhvMxJ6RM)明确：注册标签页侧栏后，不再因为全局侧栏打开就自动显示它。[对应源码变更](https://chromium.googlesource.com/chromium/src/+/6dd962b30f8540dcbdd48a31e5b51f788924ff21%5E!/)移除了用 tab enabled=false 隐藏全局侧栏的测试，并加入全局配置不受标签配置影响的测试。

源码和文档支持接口判断，不是本机新设计的运行验收证据。

## 已明确的产品取舍

候选方向：改为窗口共享侧栏。每个窗口首次点击工具栏直接打开，后续“+”和 Cmd+T 沿用它。普通网页也保留侧栏；用户关闭后，再次打开仍需工具栏点击。新增窗口、Chrome 重启、扩展重载后的首次打开不承诺免点击。

用户已明确拒绝这个方向：侧栏必须只在新标签页显示。因此窗口共享侧栏候选排除。当前未修改产品代码，也未把该候选标记为实现成功。

当时的要求固定为：保留原生 NTP、只在 NTP 显示侧栏、普通“+”/Cmd+T 无额外点击带出侧栏。该轮未找到可靠实现路径，不应以注册成功、普通网页保留侧栏或控制标签页代替用户要求。用户在 2026-10-03 另行允许一击扩展入口和修改 Command+T 作为退路；本轮已继续核查，而不是把该旧结论当作终点。

用户随后也明确拒绝 macOS 辅助程序。后续仅研究纯扩展路径，不再把系统辅助功能操作 Chrome 作为候选方案。

追加源码核对确认：Chromium 的 tabs_event_router.cc 对 onCreated 与 onUpdated 明确使用 kNotEnabled 用户手势标记；SidePanelOpenFunction 会拒绝无手势调用。把 open 移到创建/更新回调或去掉 await 不解决原生“+”/Cmd+T 的自动打开。来源：[标签事件路由](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/extensions/api/tabs/tabs_event_router.cc)、[侧栏打开实现](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/extensions/api/side_panel/side_panel_api.cc)。现阶段尚未找到满足全部约束的可靠公开接口路径，新增功能设计见 [侧栏编辑与常访问子菜单](sidepanel-editing-and-frequent-sites-proposal.md)。

## 后续实测标准

只启用方案 1。分别按“+”和 Cmd+T，观察原生 NTP 与 40 项侧栏是否共存且无额外点击；再切到普通网页，核对侧栏隐藏。测试两个 Chrome 窗口的导航归属、手动关闭后的行为、同标签离开 NTP 后返回、重新加载和重启边界。仅在可见 UI 验证后宣称新标签自动带出侧栏。
