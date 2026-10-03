# 开发说明

本仓库有两个独立方案：方案 1 位于 `sidepanel/extension/`，方案 3 位于 `pip-shortcuts/extension/`。修改时明确目标方案，两份扩展分别加载。

## 环境与检查

使用 Node.js 22 或更新版本。项目使用 Node 内置测试，无 npm 依赖。Python 3 用于打包。

```sh
npm test
npm run check
```

修改功能后重新加载对应方案的安装目录。不要为了复测移除原安装，以免丢失本地数据。旧根目录加载路径如需迁移，先参考 [迁移说明](docs/migration.md)。

## 修改约定

- 保留原生新标签页，只在符合条件的 NTP 上显示侧栏。
- 导航和编辑请求必须验证扩展身份、活动标签、窗口与 `pendingUrl`。
- 权限变化、菜单关闭和目标变化必须使旧历史请求与导航令牌失效。
- 不记录用户历史结果、普通网页完整 URL、原始敏感 API 错误或个人快捷方式。
- 自动测试验证业务和 API 边界；用户手势、浏览器可见性和焦点行为需要实际浏览器验收。

问题报告可提供 Chrome 版本、操作步骤和预期/实际表现。附诊断或截图前，请移除账号、个人网址和其他私人内容。

方案 3 的检查：

```sh
npm test --prefix pip-shortcuts
npm run check --prefix pip-shortcuts
```
