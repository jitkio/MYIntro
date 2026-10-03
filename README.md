# MYIntro 运行核心

一个基于 Node.js、React 和 Vite 的知识库网站核心，支持 Markdown 阅读、目录树、搜索、明暗主题、管理登录和可选的思源笔记同步。

本仓库只包含运行代码、通用配置模板及必要的第三方许可。没有原站文章、附件、个人图标、署名、联系方式、线上域名、服务器部署信息、真实凭据或原项目提交历史。测试中的短文、标识和口令均为人工测试数据。

## 本机运行

需要 Node.js 22 或更新版本。进入 `site` 目录：

```sh
npm ci
npm run dev
```

浏览器访问本机 8796 端口。没有文章时页面展示空列表，服务启动会自动建立本地数据目录。

生产运行：

```sh
npm run build
npm start
```

验证：

```sh
npm test
```

## 本地配置与内容

将根目录 `.env.example` 复制为 `.env`，只在本机填写自己的设置：

- `KB_PUBLIC_ORIGIN`：自己的站点地址；留空时使用本机地址。
- `KB_ADMIN_TOKEN`：自己的管理口令；留空且未配置思源授权码时管理操作不可用。
- `SIYUAN_BASE_URL`：自己的思源服务地址；留空时使用本机思源端口。
- `SIYUAN_PUBLIC_URL`：可选的编辑器入口；留空时不显示入口链接。
- `SIYUAN_ACCESS_AUTH_CODE`、`SIYUAN_API_TOKEN`：自己的思源凭据；模板不包含凭据。
- `SIYUAN_SYNC_NOTEBOOKS`、`SIYUAN_PUBLIC_NOTEBOOKS`：自行指定同步及公开范围。

本机文章放在 `content/articles`，附件放在 `content/media`。只有带 `published: true` 元数据的文章会公开。未指定公开笔记本时，首次同步的文章默认作为草稿。

`.env`、文章、附件、思源工作区、运行索引、备份和构建产物均被 `.gitignore` 排除。

## 文章中的视频与音频


在思源笔记中直接插入视频或音频附件，网站同步后会按正文位置显示播放器。同一篇文章可以包含多个播放器；默认显示控制条、只预加载媒体信息，不自动播放，并保留下载入口。

手写 Markdown 可以使用普通附件链接：

```markdown
[演示视频](/media/demo.mp4)

[录音](/media/voice.mp3)
```

思源导出的 `<video>`、`<audio>` 以及 `<source>` 格式也会被识别，包括视频封面。播放器只使用允许的媒体地址和属性；其他 HTML 仍按文本处理，代码示例不会变成播放器，也不会使附件公开。

识别的视频扩展名为 MP4、WebM、OGV、M4V、MOV；音频为 MP3、M4A、AAC、WAV、OGG、OGA、Opus、FLAC。浏览器能否播放取决于具体编码；网站不自动转码，不兼容的文件仍可下载。优先使用 H.264/AAC 编码的 MP4 视频和 MP3 音频。

媒体文件保存在内容数据目录，不进入代码仓库。只有公开文章实际引用的媒体与封面可访问；播放器支持按字节范围读取，便于拖动播放进度。

## Docker 与 PM2

使用 Docker 前先在本机 `.env` 设置自己的思源访问授权码，再从根目录运行：

```sh
docker compose up -d --build
```

数据默认保存在被忽略的 `.private-data` 目录。所有对外端口默认绑定本机。

如已安装 PM2，在完成依赖安装与构建后，可从根目录运行：

```sh
pm2 start ecosystem.config.cjs
```

## 结构与许可

- `site/server`：内容索引、搜索、管理会话与思源同步。
- `site/shared`：前后端共用的路径和导航逻辑。
- `site/src`：页面、组件、Markdown 渲染与样式。
- `site/public`：通用背景和图标。
- `site/test`：使用临时目录和模拟服务的测试。

前端使用经过修改的 Fluid 样式，GPL-3.0 许可见 `site/src/LICENSE`。第三方版权与许可说明见 `site/THIRD_PARTY_NOTICES.md`，其必要声明按原样保留。
