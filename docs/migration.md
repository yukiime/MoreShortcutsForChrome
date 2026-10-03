# 方案 1 旧加载路径的迁移

两个方案现在采用对称目录：`sidepanel/extension/` 和 `pip-shortcuts/extension/`。新安装直接加载对应目录。

## 已有安装与数据

Chrome 已解压扩展的 ID 通常与加载路径相关。把旧根目录 `extension/` 直接换成 `sidepanel/extension/` 可能产生不同的扩展 ID，不会自动迁移 storage.local 中的编辑数据与设置。

本次整理在原本机项目中保留了一个被 Git 忽略的根目录兼容链接：`extension` 指向 `sidepanel/extension`。已有 Chrome 安装仍按旧路径读取相同源码。该链接不上传 GitHub，也不进入源码或扩展 ZIP。

原本机安装应继续使用原扩展卡片的“重新加载”，不要移除后另装。对新克隆的仓库直接加载 `sidepanel/extension/`。

如果另一台电脑也需要保留旧路径，可以从仓库根目录创建相同链接（macOS/Linux）：

```sh
ln -s sidepanel/extension extension
```

创建前确认根目录没有同名目录或文件。当前没有跨扩展 ID 自动迁移工具，源码包也不会备份个人编辑数据。
