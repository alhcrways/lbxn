# 蜡笔小新桌宠

一款使用 Electron、React 和 TypeScript 开发的 Windows 桌面宠物。当前 MVP 以自然眨眼的小新为常驻形象，包含聊天、害羞互动和多便利贴功能。

## 当前功能

- 自然眨眼待机，透明无边框窗口常驻桌面
- 拖动小新调整位置，支持置顶、显示/隐藏和鼠标穿透
- 双击小新进入害羞状态，约 3 秒后恢复默认眨眼
- 鼠标靠近小新时显示聊天入口
- 独立聊天小窗，回复期间切换为思考表情
- 支持 DeepSeek、Qwen、Kimi、智谱、豆包及自定义 OpenAI Chat Completions 兼容接口
- API Key 仅保存在用户本机
- 可同时创建多张便利贴，支持自动保存、固定置顶、关闭、重新打开和删除
- 便利贴可上下缩放，缩小时保留标题、首行文字和底部装饰

养成系统和右键菜单中的聊天入口目前由功能开关隐藏，代码仍保留，完成后可以重新启用。悬浮聊天入口保持可用。

## 使用方式

### 普通用户

普通用户不需要安装 Node.js。请从 GitHub Releases 下载作者发布的 Windows 安装版或便携版：

- 安装版：运行安装程序，安装完成后从桌面或开始菜单启动。
- 便携版：下载 `.exe` 文件后直接运行，不需要安装。

如果仓库暂时还没有发布 Release，只能从源码运行，此时才需要安装 Node.js。

桌宠启动后：

1. 按住小新并拖动，可以把他放到桌面的任意位置。
2. 双击小新，他会进入害羞状态，并在几秒后自然恢复眨眼待机。
3. 把鼠标移到小新附近，点击出现的聊天图标即可打开聊天框。
4. 第一次聊天前，右键小新打开“春日部控制台”，进入“聊天设置”配置模型厂商、模型名称和 API Key。
5. 右键小新选择“便利贴”，可以新建和管理多张便签；便签内容会自动保存。
6. 需要暂时点击桌宠后面的窗口时，可以在右键菜单或系统托盘中开启“鼠标穿透”。关闭穿透后可继续拖动和操作小新。
7. 要完全关闭程序，请从右键菜单或系统托盘选择“退出”。直接关闭聊天框或便利贴不会退出桌宠。

程序会在系统托盘保留入口。如果暂时找不到小新，可以从托盘菜单重新显示桌宠；已经固定的便利贴也会在下次启动时恢复。

### 从源码运行

源码开发需要 Node.js 18 或更高版本。在项目目录执行：

```bash
npm install
npm run dev
```

其他命令：

```bash
npm run typecheck   # TypeScript 检查
npm run build       # 构建渲染进程和 Electron 主进程
npm start           # 构建并启动生产模式
```

项目附带 `开发模式启动.bat` 和 `启动桌宠.bat`。使用这两个脚本前，同样需要先安装 Node.js 并执行 `npm install`。

打包 Windows 安装版和便携版：

```bash
npm i -D electron-builder
npm run dist
```

生成的文件位于 `release/` 目录。将这些 `.exe` 文件上传到 GitHub Releases 后，普通用户即可直接使用。

## 聊天设置

右键小新并选择“聊天设置”，然后：

1. 选择模型厂商。
2. 填写该厂商提供的模型名称。
3. 填写自己的 API Key。

选择“自定义接口”时还需要填写接口地址。地址可以是 Base URL，也可以是完整的 `/chat/completions` 地址；远程服务要求 HTTPS，本机服务可以使用 HTTP。

聊天会把消息发送给用户选择的模型服务商，因此需要网络连接。便利贴、桌宠状态和 API 配置保存在本机应用数据目录中。

## 便利贴

- 右键小新选择“便利贴”，或从托盘打开“便利贴 / 便签夹”。
- 便签右上角的 `＋` 可以继续创建新便签。
- 图钉用于切换置顶状态；固定的便签会在下次启动时恢复。
- `×` 会保存并关闭便签，之后可以从便签夹重新打开。
- 删除操作集中在便签夹中，避免误删正在编辑的内容。
- 拖动便签底边可以改变高度，宽度保持不变。

本地数据默认位于：

```text
%APPDATA%/shinchan-pet/shinchan-pet-data/
```

## 当前角色素材

开源 MVP 只包含当前界面实际使用的四项默认素材：

```text
src/renderer/public/character/default/
├─ blink.webp       默认眨眼
├─ idle.png         站姿回退
├─ shy.png          双击害羞
└─ thinking.webp    聊天思考
```

其他实验动作、像素版形象和未开放换装素材保留在开发者本机，不进入仓库。

角色资源扫描规则记录在 `src/renderer/public/character/README.txt`。缺失姿态时，程序会回退到内置 SVG 形象。

## 项目结构

```text
src/
├─ main/                       Electron 主进程、窗口、IPC、存储和模型请求
├─ shared/                     主进程与渲染进程共享类型、功能开关和角色人设
└─ renderer/
   ├─ components/              桌宠及功能界面
   ├─ data/                    配置、台词和窗口尺寸
   └─ public/character/        当前发布使用的角色素材
assets/
├─ icon.png                    托盘图标
└─ note-decor/                 便利贴装饰
scripts/                       构建辅助和界面回归检查
```

开源首版入口由 `src/shared/releaseFeatures.ts` 控制。

## 模型兼容

厂商配置位于 `src/main/modelPresets.ts`。预设使用各厂商的 OpenAI 兼容接口，具体模型名称、账号权限、地域和额度以服务商控制台为准。

- [DeepSeek API 文档](https://api-docs.deepseek.com/)
- [阿里云百炼 OpenAI 兼容接口](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)
- [Kimi API 指南](https://platform.kimi.com/blog/posts/kimi-api-quick-start-guide)
- [智谱开放平台文档](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction)
- [豆包火山方舟文档](https://docs.volcengine.com/docs/ark/context-management?lang=en)

## 开源与素材说明

项目代码使用 [MIT License](LICENSE)。

“蜡笔小新”等角色名称和角色形象的相关权利归原权利方所有。仓库中的角色素材仅用于学习、交流和功能演示，不包含在 MIT 代码许可范围内。公开分发或商业使用前，请自行确认已获得所需授权。
