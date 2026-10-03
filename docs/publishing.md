# GitHub 发布说明

## 上传内容

上传 Git 跟踪的源码、测试、脚本、文档和归档。方案 1 在根目录 `extension/`，方案 3 在 `pip-shortcuts/extension/`，两份源码都随同一仓库上传。`docs/archive/` 是历史设计资料。

`.gitignore` 排除 `.local/`、`build/`、`dist/`、原始验收目录、ZIP、日志、环境变量文件和系统缓存。`.local/` 可能包含私人本机资料，不要使用忽略规则以外的整目录上传或 `git add -f`。

若使用 GitHub 网页上传，可先运行 `npm run package`，解压 `dist/MoreShortcutsForChrome-source.zip`，上传其中的项目文件。源码包包含 `.gitignore`，不包含 `.git` 和本地资料。

## 上传前检查

```sh
npm test
npm run check
npm run package
git status --short
git diff --cached --stat
```

选择公开或私有仓库，并确认许可证。本项目尚未默认选择许可证；需要明确授权后再添加 `LICENSE`。

## 使用 Git 上传新空仓库

在 GitHub 新建空仓库后，把下面的占位地址替换成真实仓库地址：

```sh
git remote add origin <你的GitHub仓库地址>
git push -u origin HEAD:main
```

如果远端已有内容，应先检查分支关系再合并。不要强制覆盖远端历史。现有 Git 作者信息和历史提交会随 Git 推送上传，源码 ZIP 不包含这些元数据。

## 发布扩展包

GitHub Release 可分别附方案 1 的 `dist/MoreShortcutsForChrome-extension.zip` 和方案 3 的 `dist/MoreShortcutsForChrome-pip-extension.zip`。使用者选择方案，解压对应 ZIP 后加载里面的 `extension/` 文件夹。源码和扩展 ZIP 均不包含个人编辑数据，扩展包也不是 Chrome Web Store 签名安装包。
