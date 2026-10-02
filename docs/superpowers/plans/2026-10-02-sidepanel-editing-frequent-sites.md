# 侧栏编辑与常访问菜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在方案 1 的侧栏内编辑并持久保存名称和 URL，新增展示最多 20 个常访问网站的子菜单。

**Architecture:** 保留逐标签侧栏与导航安全校验。后台统一管理本地清单、版本化编辑和临时常访问结果，panel 负责界面与可选历史权限请求。纯函数负责 URL 规范化和网站汇总排序。

**Tech Stack:** Chrome MV3，原生 JavaScript/HTML/CSS，Node 内置测试，无新增依赖。

**Spec:** [用户已确认的设计](../../sidepanel-editing-and-frequent-sites-proposal.md)

## Global Constraints

- 范围只限方案 1；方案 3 仅保留历史代码。
- 保留 Chrome 原生新标签页；侧栏只在新标签页显示；不新增辅助程序、控制标签页或二级跳转。
- 自动显示尚未实现，不能把新增功能验收当成自动显示通过。
- 编辑数据存于 chrome.storage.local，不写源码、文件、Git 或远程服务。
- history 为可选权限，拒绝不影响自定义快捷方式；历史统计只在菜单打开/刷新时触发。
- URL 仅允许无账号密码的 HTTP/HTTPS；保留既有 id、顺序和图标。
- 网站按主机名汇总 visitCount；HTTP/HTTPS 合并，不同子域分别计数；降序取 20 项，不足不补齐。
- Git 作者和提交者均使用本地用户，不添加 Codex 署名，不发布到 GitHub。

## Review Focus

1. 保存时 storage.local 失败：原数据保持不变，草稿仍可重试。任务 1、3 测试。
2. 两个面板同时编辑：较旧版本不能覆盖已保存数据。任务 1 测试。
3. 读取历史期间用户撤销权限/删除历史：旧请求不能恢复旧列表或允许缓存导航。任务 2 测试。
4. 编辑或常访问菜单中的旧目标移窗/失活：不能导航其他网页。任务 2 测试。
5. 菜单异步加载晚于关闭菜单：不能把用户带回菜单；失败不能伪装空榜单。任务 3 测试。

## Task 1：版本化清单保存与后台编辑

**Files:** Create `extension/shortcut-store.js`, `tests/shortcut-store.test.mjs`, `tests/worker.test.mjs`; modify `extension/core.js`, `extension/controller.js`, `extension/worker.js`.

**Interfaces:**
- `normalizeShortcutEdit({title,url}) -> {title,url}`：URL 缺少协议时补 HTTPS，然后复用既有校验；显式非 HTTP/HTTPS 协议拒绝。
- `createShortcutStore(api, defaults) -> {read(), edit({id,title,url,revision})}`；read 返回 `{revision,shortcuts}`，edit 串行校验、持久保存后返回同结构。storage.local 键 `shortcutDocument`，内部数据为 `{version:1,revision,shortcuts}`。
- `createController(api,shortcuts,record,readShortcuts=async()=>shortcuts)`：新增可选清单读取函数，在导航队列内读取最新项，保持旧接口测试兼容；worker 新增 `shortcuts:get`、`shortcuts:edit` 消息，均校验 sender.id 与 panelContext。

- [ ] 写失败测试：`normalizes bare domain and rejects explicit unsafe schemes` 断言 example.com 变为 https://example.com/，javascript/file/账号密码/空标题被拒绝。
- [ ] 写失败测试：`edits persist across store recreation` 断言修改 id 保持、顺序与图标不变，新 store 读回修改；`storage failure preserves previous document` 断言拒绝后 read 仍是旧值；`stale revision cannot overwrite a concurrent edit` 断言只有第一个同版本编辑成功。
- [ ] 运行 `node --test tests/shortcut-store.test.mjs`，确认缺少新行为导致失败。
- [ ] 实现 store：默认文档仅在没有已保存文档时使用；损坏保存数据报错，不静默覆盖。版本值为非负安全整数，成功保存递增 1。所有修改在单一队列中重读 storage.local。
- [ ] 实现 worker 消息与导航读取：保存成功后更新可见面板；普通导航使用最新已保存 URL。失败只回传原因，不把 URL 或历史记录加入诊断。
- [ ] 运行 `npm test`；新增 worker 测试断言外部/diagnostics/过期面板消息拒绝，编辑成功后的导航使用新 URL。
- [ ] 以本地用户提交：`feat: persist side panel shortcut edits`。

## Task 2：常访问排名、可选权限与安全导航

**Files:** Create `extension/frequent-sites.js`, `tests/frequent-sites.test.mjs`; modify worker/controller、`extension/manifest.json`, `scripts/check.mjs`, worker tests。

**Interfaces:**
- `rankFrequentSites(historyItems,limit=20) -> [{id,title,url,visitCount,lastVisitTime}]`：id 为主机名，title 为主机名，url 为同主机已观察到的优先 HTTPS origin 加 `/`。跳过无效/凭据/非 HTTP/HTTPS URL 与无效次数。
- worker `frequent:get` 返回 `{ok:true,token,sites}`；导航消息使用 `{type:'navigate',source:'frequent',shortcutId,token,disposition}`，只能命中同 panelContext 的临时后台列表。
- 可选权限 `history`；原必需权限仍为 sidePanel/tabs/storage。

- [ ] 写失败测试：重复 HTTP/HTTPS URL 与不同路径合并访问次数，子域分开，23 个主机截为 20，3 个主机不补齐，次数相同按时间与主机名稳定排序。
- [ ] 写失败测试：无历史权限时不查询历史；读取失败返回错误；撤销权限/删除历史使在途请求和导航 token 失效。
- [ ] 运行 `node --test tests/frequent-sites.test.mjs tests/worker.test.mjs`，确认新行为缺失导致失败。
- [ ] 实现排名和后台查询：history.search 显式 `text:''`、`startTime:0`、`maxResults:2147483647`，结果达到上限时返回不完整错误。列表缓存仅在内存，worker 重启后旧 token 失效。权限/历史删除事件递增请求版本、清空缓存并通知 panel 清空。
- [ ] 复用 controller 的上下文与 NTP 校验后导航常访问项，禁止消息传入任意 URL；读取历史前后再次核对权限与请求版本。
- [ ] 运行 `npm test && npm run check`；包含旧目标失活、移窗、pendingUrl、窗口隔离、token 错误的导航测试。
- [ ] 以本地用户提交：`feat: add permission-aware frequent sites data`。

## Task 3：侧栏内编辑与二级菜单界面

**Files:** Modify `extension/panel.html`, `panel.css`, `panel.js`, `manifest.json`, `README.md`; create `tests/panel.test.mjs`。

**Interfaces:** panel 使用任务 1、2 的消息接口。存储变更仅在非脏草稿状态自动更新界面；脏草稿显示冲突提示并保留内容。使用 DOM textContent 和 createElement 渲染。

- [ ] 写失败 DOM 行为测试：编辑模式点条目不会导航；保存消息包括条目 id 和原 revision；保存失败保持输入；取消/Esc 不保存；成功后名称与 URL 更新。
- [ ] 写失败 DOM 行为测试：常访问按钮在侧栏内进入子菜单；返回不创建标签；权限申请在真实按钮点击回调立即调用；拒绝权限显示原因；加载失败显示错误；关闭菜单后的旧响应不重开菜单。
- [ ] 运行 `node --test tests/panel.test.mjs`，确认失败来自缺少界面行为。
- [ ] 添加顶部编辑/常访问按钮、行内编辑表单、子菜单返回/刷新按钮、权限说明和加载状态；成功保存前不修改网格。权限撤销或历史删除通知立即清除列表。保持键盘可达与现有网格布局。
- [ ] 更新 manifest 版本至 0.2.0；README 说明编辑持久化、历史统计依据、可选权限和自动显示未实现。说明本地验证附录未纳入 Git，正式公开前需整理报告链接与许可证。
- [ ] 运行 `npm test && npm run check`，Git diff 检查无个人网址、历史列表或敏感运行日志。
- [ ] 浏览器只启用方案 1，在自建窗口实测编辑、重载后保存、子菜单返回/刷新、20 项与权限拒绝、两窗口导航。保留用户现有窗口，不自动重启 Chrome；无法实测的项目逐项记录。
- [ ] 运行打包脚本并核对 ZIP 内容。以本地用户提交：`feat: add side panel editor and frequent sites menu`。

## 自检与交付

- 已逐项核对设计覆盖、接口名与属性名一致；不包含自动显示修复的虚假任务。
- 每项的失败回归先运行，再实现，最后执行整个方案 1 测试与静态检查。
- 最终独立代码审查按执行技能要求进行；实际浏览器行为与自动测试分别报告。
- 执行方式待用户选择：建议本会话直接实施，三个任务共享后台与 UI 接口。可选择原目录或隔离工作树，不默认创建额外工作树。
