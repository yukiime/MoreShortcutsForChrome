# Sidepanel prototype implementation plan

> 历史 0.1.0 记录。当前 0.2.0 实现与未验收项目见 [本轮验收记录](sidepanel-improvements-validation-2026-10-03.md)。

Goal: 原生 NTP 保留，40 个额外快捷方式可在普通 MV3 标签页面板使用。
Spec: docs/sidepanel-design.md
Architecture: 独立标签页面板，默认禁用全局面板；窗口与标签身份从面板路径绑定，所有导航通过 worker。
Tech stack: 原生 HTML/CSS/ES modules；Node 内置测试用于开发，加载不需要 Node 或构建。

## 约束与重点

最低 Chrome 145，使用 close() 当前 tab/global 分离语义。目标 .58 未运行，本机实际 .93。权限仅 sidePanel/tabs/storage；不读取内容，不持久化用户浏览 URL。不改变全屏、Spaces、flags 或其他扩展。

重点检查 pendingUrl 覆盖旧 URL、未知 URL、两窗口与过期面板、导航期间重复事件、worker 重启恢复配置。

## 任务

- [x] 1. `tests/core.test.mjs` 先测试 NTP 别名、URL 过渡、JSON 校验与窗口绑定。运行失败后实现 `extension/core.js`。
- [x] 2. `tests/controller.test.mjs` 先测试注册、关闭类型、重新初始化、多窗口导航拒绝与修饰键行为。运行失败后实现 `extension/controller.js` 与 worker 事件连接。
- [x] 3. 创建 manifest、40 项清单、panel 页面与 CSS。仅按钮网格，不自动 focus。诊断页保留 API 日志，不提供复杂管理。
- [x] 4a. 语法/清单/自动测试通过后写 README、验证矩阵，制作 ZIP，提出明确加载请求。
- [ ] 4b. 获得本地扩展加载确认后进行真实浏览器生命周期测试，更新矩阵。
- [x] 5. 独立代码审查，修正影响导航或状态的缺陷。最终报告保留所有未测试项。

执行：当前会话顺序实施。用户明确要求继续到可加载原型，省略技能默认的计划审批；无 Git，不建立仓库或额外工作树。所有运行检查保留在 validation/。
