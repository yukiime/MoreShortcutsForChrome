# 方案 1：原生新标签页侧边栏

保留 Chrome 原生新标签页，在逐标签侧栏中显示 40 个可编辑快捷方式；支持常访问二级菜单和原生“+”自动显示实验。进入普通网页时隐藏侧栏。

版本 **0.3.0**，最低 Chrome **145**。工具栏、手动 Command+T 入口及原生“+”实验已在 Chrome 154 实测。自动显示依赖 debugger/offscreen，Chrome 会显示调试提示。

## 安装和使用

在 `chrome://extensions` 开启开发者模式，加载本仓库的 **`extension/`**。点击工具栏按钮打开真实 NTP 与侧栏。需要原生“+”自动显示时，在侧栏开启“原生新标签自动显示（实验）”。

点击“编辑”修改条目；开启“显示常访问”后按提示授予可选 history 权限。快捷方式和设置保存在本扩展自己的 storage.local，与方案 3 不自动同步。

旧根目录安装的迁移与数据保留见 [迁移说明](docs/migration.md)。不要直接移除现有扩展后重新加载，以免丢失编辑数据。

## 权限和数据

必需权限为 sidePanel、tabs、storage、debugger 和 offscreen；history 为可选权限，仅在用户授权后查询常访问。自动显示默认关闭，开启后只附着本扩展隐藏文档；debugger 权限本身较广，Chrome 会显示调试提示。

清单和设置保存在本地，不上传历史结果或个人编辑数据。当前无一键导出全部存储，源码包不能代替个人数据备份。完整行为与限制见 [使用细节](docs/usage.md)。

## 开发

本仓库可独立克隆。Node.js 22 或更新版本用于检查，Python 3 用于打包，无需 npm install。从本仓库根目录执行：

```sh
npm test
npm run check
npm run build
npm run package
```

构建输出 `build/extension/`；打包输出 `dist/source.zip` 和 `dist/extension.zip`。源码包包含说明、测试和脚本，扩展包解压后加载 `extension/`。

[总项目](https://github.com/yukiime/MoreShortcutsForChrome)保留两个方案的对照与开发历史。[方案 3 独立仓库](https://github.com/yukiime/MoreShortcutsForChrome-pip)提供 PiP 实验。两份扩展的数据不自动同步。

| 目录 | 内容 |
| --- | --- |
| extension/ | 可直接加载的扩展源码 |
| tests/ | Node 测试与 API 替身 |
| scripts/ | 独立检查、构建、图标生成及打包入口 |
| docs/ | 使用、架构、验证与历史研究 |

详见 [使用细节](docs/usage.md)、[架构](docs/architecture.md)、[验证记录](docs/validation.md)。
