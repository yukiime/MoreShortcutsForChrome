# 原生 NTP 额外快捷方式

保留 Chrome 真正的新标签页，在其逐标签侧栏中展示 40 个可编辑快捷方式。普通网页不显示本扩展侧栏。MV3、原生 JavaScript，无 npm 依赖、远程脚本或图标请求。当前版本 0.2.0，最低 Chrome 145。

## 加载与入口

1. 在 `chrome://extensions` 开启开发者模式，加载本项目的 **extension 文件夹**。
2. 固定“原生 NTP 额外快捷方式（侧边栏原型）”到工具栏。
3. 从任何标签页点击这个按钮，一次创建一个真实 `chrome://newtab/` 并打开该新标签的独立侧栏。
4. 若希望 Command+T 使用同一入口，在 `chrome://extensions/shortcuts` 将“新建原生标签页并打开快捷方式”绑定到 Command+T，范围选“在 Chrome 中”。默认不自动分配或覆盖快捷键。其他平台可手动配置对应组合。

2026-10-03 本机 Chrome 154.0.8037.93 arm64 已实测工具栏入口、Command+T 在普通网页/NTP/地址栏聚焦时的入口、两个自建窗口的目标归属，以及清除绑定后的原生命令恢复。本机目前保留该绑定。重载尚未完成的瞬间按 Command+T，曾出现只创建原生 NTP 的过渡状态；重载完成后再次按键正常。详细边界见 [本轮验收记录](docs/sidepanel-improvements-validation-2026-10-03.md)。

稳定版的**原生“+”仍只创建原生 NTP，不自动打开新标签的侧栏**。工具栏按钮和已绑定命令才是一击入口。按钮创建新标签页；需要恢复当前 NTP 的面板时，可使用 Chrome 自带的侧栏选择器。按钮位置由 Chrome 管理，无法放到原生“+”旁。

若电脑在本轮交付时已锁屏，解锁后在扩展卡片点一次“重新加载”，即可确保浏览器使用最后的审查修复。

## 侧栏内编辑

点击“编辑”，再点一个条目，在侧栏内修改名称和网址。网址可省略协议，按 HTTPS 规范化；仅允许无账号密码的 HTTP/HTTPS。保存保留条目 ID、顺序和文字图标。保存期间锁定输入，失败保留草稿，取消或 Esc 不保存。

数据写入 `chrome.storage.local`，重载扩展和重启浏览器后保留，不回写源码。多个面板使用 revision 防止旧版本覆盖新修改。若另一面板已保存，保留当前草稿，显示“刷新版本并保留草稿”；刷新后再次保存，会覆盖此条目的当前名称和网址。恢复隐藏面板时重新同步清单，避免名称和实际打开地址不同步。

普通点击导航该面板所属窗口的活动 NTP。⌘/Ctrl 点击或中键在同窗口新建后台标签，Shift 点击新建前台标签。修饰键和中键的真实输入仍待人工复测；自动测试已验证对应导航参数。目标移窗、失活、离开 NTP 或存在非 NTP 的 pendingUrl 时拒绝旧请求。

## 常访问

“显示常访问”是持久开关，默认关闭。开启后每次打开或恢复侧栏会展开二级区域，原快捷方式仍保留。收起仅临时隐藏，顶部“展开常访问”可重新打开，不改变持久设置。关闭开关停止查询并清除列表及导航缓存。

首次读取历史需要点击“允许读取历史”，由 Chrome 请求可选 `history` 权限。未授权或拒绝时仍可使用自定义快捷方式；关闭开关不撤销已授予权限。可在 Chrome 扩展权限设置中撤销。

排名按 Chrome History API 返回的各 URL `visitCount` 汇总 hostname，HTTP/HTTPS 合并，不同子域分别计数；按次数、最后访问时间和主机名稳定排序，最多 20 个网站，不足不补齐。点击打开历史中已观察到的该主机根地址，优先 HTTPS。这不是 Chrome 内部推荐榜单，也不是去重后的访问会话数。[History API](https://developer.chrome.com/docs/extensions/reference/api/history)

扫描固定查询截止时间，每次最多返回 2048 个 URL。触上限时拆分时间窗，重叠边界并按 URL 去重；最多 512 次查询、200000 个 URL，同一毫秒仍达上限或预算不足时显示无法完整计算。不会把截断列表当作完整榜单。时间窗按访问记录匹配，返回的 URL 元数据仍是 Chrome 当前记录，因此不声称提供事务性历史快照。

历史仅在扩展内计算，临时结果只存内存，不上传、不写 Git 或诊断日志。关闭开关、收起菜单、撤销权限或删除历史使旧请求与导航 token 失效。worker 休眠后旧 token 也会失效，刷新列表可恢复。

## 原生“+”自动显示实验

这条路径已实现并通过 API 边界测试，**尚未通过实际 Chrome 运行验收**。日常 `extension/manifest.json` 不包含 debugger/offscreen；单独构建：

```sh
npm run build:experiment
```

实验目录为 **build/native-auto-open**。使用实验版时应停用稳定版，避免同时装两个实例；实验版是同一程序的替代构建。两个扩展 ID 的本地数据和命令绑定不会自动迁移，切换前需自行备份。

实验构建把 `debugger`、`offscreen` 列为必需权限，仍默认关闭自动模式。加载后通过工具栏入口打开侧栏，在侧栏中开启“原生新标签自动显示（实验）”。只附着本扩展 offscreen 文档，利用 CDP 临时激活与扩展消息尝试打开目标 NTP，不调试用户网站或原生 NTP。隐藏文档真实承载历史排名 Web Worker，使用 WORKERS 创建理由。

Chrome 会显示调试权限警告及所有窗口可见的调试提示，最后断开后仍可能保留约 5 秒。权限范围包含广泛调试能力，即使代码仅选择自己的文档，仍不能将其描述为轻权限接口。自动链不是 Side Panel API 承诺的稳定自动打开功能，可能随 Chrome 更新、调试限制或用户取消而失效。成功、失败与超时都会尝试断开，旧目标或手动关闭后不再继续打开。失败时保留 NTP，可使用工具栏或命令退路。[Debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)、[Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)

本轮未在用户浏览器中安装实验版或授予新调试/历史权限；原生“+”自动显示不能标为已解决。研究依据见 [入口改进研究](docs/sidepanel-auto-open-research-2026-10-03.md)。

## 权限、数据与开发

| 权限 | 用途 |
|---|---|
| sidePanel | 注册、打开和关闭逐标签面板，全局默认禁用 |
| tabs | 识别 NTP、核对 pendingUrl、活动标签与明确窗口，创建和导航标签 |
| storage | local 保存快捷方式与设置，session 保存最多 120 条短期诊断事件 |
| history（可选） | 开关开启且用户授权后，在本地计算常访问排名 |
| debugger / offscreen（仅实验构建） | 自有隐藏文档的自动显示实验及真实 Web Worker |

没有 host_permissions、content_scripts、newtab override、辅助应用、可见控制标签页或独立浮窗。方案 3 的历史代码保留在 pip-shortcuts，不是当前实施范围。

初始条目来自 `extension/shortcuts.json`；已有 local 清单时不再用文件覆盖。复制源码或 ZIP **不会备份个人编辑数据**。个人数据位于 Chrome 扩展 local 存储，当前没有一键导入导出界面；移除扩展会删除这份数据，请先备份。损坏数据会报错，不静默重置。诊断页只是排查工具，不是编辑入口。

```sh
npm test
npm run check
npm run build:experiment
python3 scripts/package.py
```

Node 测试覆盖业务、UI 行为和 Chrome API 边界，不能代替浏览器手势、可见性或恢复行为验收。打包生成稳定源码 ZIP 与独立实验扩展 ZIP，不包含 validation、进度日志、Chrome 用户资料或历史结果。旧验证附录位于被 Git 忽略的 validation；本轮可共享记录在 docs。正式公开前仍需选择许可证并整理旧轮公开证据。本轮仅本地提交，没有推送或发布 GitHub。
