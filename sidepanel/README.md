# 方案 1：原生新标签页侧边栏

保留 Chrome 原生新标签页，在逐标签侧栏中显示 40 个可编辑快捷方式；支持常访问二级菜单和原生“+”自动显示实验。进入普通网页时隐藏侧栏。

版本 **0.3.0**，最低 Chrome **145**。工具栏、手动 Command+T 入口及原生“+”实验已在 Chrome 154 实测。自动显示依赖 debugger/offscreen，Chrome 会显示调试提示。

## 安装和使用

在 `chrome://extensions` 开启开发者模式，加载本目录的 **`extension/`**。点击工具栏按钮打开真实 NTP 与侧栏。需要原生“+”自动显示时，在侧栏开启“原生新标签自动显示（实验）”。

点击“编辑”修改条目；开启“显示常访问”后按提示授予可选 history 权限。快捷方式和设置保存在本扩展自己的 storage.local，与方案 3 不自动同步。

旧根目录安装的迁移与数据保留见 [迁移说明](../docs/migration.md)。不要直接移除现有扩展后重新加载，以免丢失编辑数据。

## 开发

从仓库根目录执行：

```sh
npm test --prefix sidepanel
npm run check --prefix sidepanel
npm run build --prefix sidepanel
```

也可进入本目录执行 `npm test`、`npm run check` 和 `npm run build`。根目录 `npm run package` 统一生成源码和两份扩展包。

| 目录 | 内容 |
| --- | --- |
| extension/ | 可直接加载的扩展源码 |
| tests/ | Node 测试与 API 替身 |
| scripts/ | 独立检查、构建、图标生成及打包入口 |
| docs/ | 使用、架构、验证与历史研究 |

详见 [使用细节](docs/usage.md)、[架构](docs/architecture.md)、[验证记录](docs/validation.md)。
