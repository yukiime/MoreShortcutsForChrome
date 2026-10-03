# 总项目与独立仓库

三个仓库均为公开仓库：

| 总项目中的目录 | 对应仓库 |
| --- | --- |
| 全部目录、总览和共享发布文档 | [MoreShortcutsForChrome](https://github.com/yukiime/MoreShortcutsForChrome) |
| sidepanel/ | [MoreShortcutsForChrome-sidepanel](https://github.com/yukiime/MoreShortcutsForChrome-sidepanel) |
| pip-shortcuts/ | [MoreShortcutsForChrome-pip](https://github.com/yukiime/MoreShortcutsForChrome-pip) |

独立仓库的根目录即对应子项目内容，均有 extension/、tests/、scripts/、docs/、package.json 和 README。只需克隆其中一个即可工作，不依赖总项目。所有构建和打包产物写在子项目自己的 build/ 和 dist/ 中。

## 为什么保留普通目录

总项目继续使用对称的 sidepanel/ 和 pip-shortcuts/ 普通目录，不改成 Git 子模块或指向外部检出的文件链接。子项目的构建和打包脚本已独立：只操作自己的 extension/、build/ 和 dist/，不再读取上级项目的脚本。这消除了原来的脚本依赖。

这样直接克隆或下载总项目就有全部源码；单独克隆任一子仓库也能测试和打包。Git 子模块需要额外初始化，普通源码 ZIP 不会包含子模块内容，维护时还要同时处理子仓库提交和总项目中的指针。当前两个子项目规模较小，保留普通目录更适合本地项目的完整展示。三个 README 用网页链接互相对应。

## 后续同步

总项目作为开发整合入口。发布独立仓库时，从已检查的子目录用 git subtree 导出；没有自动双向同步。如果在独立仓库修改代码，应先把改动合回总项目，再导出后续版本，避免两边静默分叉。

维护者从总项目执行以下命令，可把当前子目录历史导出并更新独立仓库 main。先完成测试和本地提交，推送不使用 force：

```sh
git subtree push --prefix=sidepanel https://github.com/yukiime/MoreShortcutsForChrome-sidepanel.git main
git subtree push --prefix=pip-shortcuts https://github.com/yukiime/MoreShortcutsForChrome-pip.git main
```

总项目保留完整开发历史；独立仓库导出的历史仅覆盖对应目录，较早尚未放入该目录的历史仍在总项目中。个人存储、原始本机日志和生成 ZIP 不进入 Git。
