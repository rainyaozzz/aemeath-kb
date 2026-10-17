# Rain的Aemeath知识库

> 在星海轻歌的电子幽灵 —— 一个带「鸣潮 · 爱弥斯」主题的个人知识库网站。

参考 [Savia的外装代脑](https://savia7582.github.io/Exterior/) 的 mdBook 式布局搭建：左侧折叠分类目录、右侧 Markdown 正文、搜索、上下页导航，并整体套用了爱弥斯的视觉语言 —— **星海、星辉、长航、电子幽灵、雪**（深空蓝底 + 冰蓝青辉 + 雪花星光 + 全息渐变标题）。

V2 进一步参考了鸣潮官方为爱弥斯运营的角色小号 **「飞行雪绒」**（星炬学院校园歌手）：首页加入了**头图 banner**（头像光环 + 全息标题 + 标签 + 轻歌波形）、**置顶动态**卡片、**极光层**与雪豹/雪绒点缀，整体更接近 B 站个人空间的氛围。

## 目录结构

```
aemeath-kb/
├── index.html          # 页面骨架
├── config.js           # 网站标题 + 左侧目录结构（主要在这里改）
├── server.py           # 本地服务器：静态服务 + 密码上传接口
├── 预览.bat            # 双击启动本地服务器
├── assets/
│   ├── style.css       # 爱弥斯主题样式
│   └── app.js          # 渲染 / 路由 / 搜索 / 星空雪花
└── content/            # 所有 Markdown 正文
    ├── home.md
    ├── math/ …
    ├── physics/ …
    ├── engineering/ …
    ├── chemistry/ …
    ├── chemeng/ …
    └── aemeath/ …      # 鸣潮·爱弥斯专区
```

## 本地预览

直接双击 `预览.bat`（需要本机装有 Python），它会启动 `server.py`（静态服务 + 上传接口），浏览器自动打开 `http://localhost:8000`。

> 注意：不要直接双击 `index.html` 打开（file:// 协议下浏览器会拦截 Markdown 文件的加载，上传功能也无法使用）。请用 `预览.bat`。

## 如何添加 / 修改内容

1. 在 `content/` 目录下新建或编辑一个 `.md` 文件（Markdown 格式）。
2. 打开根目录 `config.js`，在 `KB_NAV` 里加一项：

   ```js
   { label: "微积分", file: "math/calculus.md" }
   ```

   要分组，就写：

   ```js
   { label: "数学", children: [ … ] }
   ```

3. 刷新页面即可看到。

## 上传资料（需要密码）

左侧栏点击 **「✎ 上传资料」**，输入密码、选择文件即可上传，文件保存到 `content/uploads/`。

- 密码在 `server.py` 顶部的 `PASSWORD` 修改（当前密码以该文件为准）。
- 密码由**服务器端**校验（密码错误会被 403 拦截），不是前端硬编码。
- 上传后想让它出现在目录里，到 `config.js` 的 `KB_NAV` 加一项即可。
- 上传功能只在本地用 `预览.bat` 启动时有效；部署到 GitHub Pages 等纯静态托管后不可用。

## 修改标题与作者

编辑 `config.js` 顶部的 `KB_SITE`：

```js
window.KB_SITE = {
  title: "Rain的Aemeath知识库",
  subtitle: "在星海轻歌的电子幽灵",
  author: "Rain",
  home: "home.md",

  // 首页头图 / 置顶动态（可自由改文案；想关掉就把 hero 整段删掉）
  hero: {
    meta: "星炬学院 · 校园歌手 · 飞行雪绒",
    chips: ["星海", "长航", "电子幽灵", "雪豹"],
    pinned: {
      label: "星海广播 · 置顶",
      body: "今晚的星海很安静，适合写一首新歌。雪豹趴在冰原上听了一会儿，就睡着了。",
      sign: "—— 电子幽灵 · 爱弥斯"
    }
  }
};
```

## 部署到 GitHub Pages

1. 新建一个 GitHub 仓库，把整个 `aemeath-kb/` 目录内的文件推上去。
2. 仓库 Settings → Pages → Source 选 `main` 分支（根目录）。
3. 访问 `https://你的用户名.github.io/仓库名/` 即可。

纯静态、零依赖、无需构建，任何静态托管（GitHub Pages / Netlify / Vercel / Cloudflare Pages）都能直接部署。

> 注意：上传功能依赖 `server.py` 本地后端，部署到纯静态托管后会失效（点击上传只会显示无法连接服务器）。
