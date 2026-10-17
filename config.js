/* ============================================================
 *  Rain的Aemeath知识库 · 配置与目录
 *  ------------------------------------------------------------
 *  在这里修改网站标题、副标题，以及左侧目录结构。
 *
 *  每个「页面项」需要两个字段：
 *    label    —— 目录里显示的名字
 *    file     —— 对应的 Markdown 文件（相对于 content/ 目录）
 *
 *  带 children 的项是一个「分组」，本身不是页面，点击可展开/收起。
 *  children 可以无限嵌套。
 *
 *  如何新增一页：
 *    1. 在 content/ 目录下新建一个 .md 文件，写入内容；
 *    2. 在下方 KB_NAV 里加一项 { label: "名字", file: "xxx.md" }；
 *    3. 刷新页面即可。
 * ============================================================ */

window.KB_SITE = {
  title: "Rain的Aemeath知识库",
  subtitle: "在星海轻歌的电子幽灵",
  author: "Rain",
  // 首页文件（对应 content/ 目录）
  home: "home.md",

  // 首页头图 / 置顶动态（爱弥斯 · 飞行雪绒 氛围文案，可自由修改）
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

window.KB_NAV = [
  { label: "主页", file: "home.md" },

  {
    label: "数学",
    children: [
      { label: "微积分", file: "math/calculus.md" },
      { label: "线性代数", file: "math/linear-algebra.md" }
    ]
  },

  {
    label: "物理",
    children: [
      { label: "力学", file: "physics/mechanics.md" },
      { label: "电磁学", file: "physics/electromagnetism.md" }
    ]
  },

  {
    label: "化学",
    children: [
      { label: "无机化学", file: "chemistry/inorganic.md" },
      { label: "有机化学", file: "chemistry/organic.md" }
    ]
  },

  {
    label: "化工",
    children: [
      { label: "化工原理", file: "chemeng/principles.md" },
      { label: "化工热力学", file: "chemeng/thermodynamics.md" }
    ]
  },

  {
    label: "工程",
    children: [
      { label: "工程图学", file: "engineering/graphics.md" }
    ]
  },

  {
    label: "鸣潮 · 爱弥斯",
    accent: true,
    children: [
      { label: "角色档案", file: "aemeath/profile.md" },
      { label: "剧情与台词", file: "aemeath/story.md" },
      { label: "配队与攻略", file: "aemeath/guide.md" }
    ]
  }
];

/* ============================================================
 *  音乐播放器歌单
 *  ------------------------------------------------------------
 *  把 mp3 文件放进 assets/music/ 目录，然后按下面格式添加：
 *    { title: "歌名", src: "assets/music/歌名.mp3" }
 *
 *  也支持用网络音频地址：
 *    { title: "歌名", src: "https://example.com/song.mp3" }
 *
 *  songs 为空时，顶部播放器显示「暂无歌曲」。
 * ============================================================ */
window.KB_MUSIC = {
  volume: 0.6,
  songs: [
    // { title: "星海轻歌", src: "assets/music/song.mp3" }
  ]
};

/* ============================================================
 *  Waline 评论系统（留言板的线上后端）
 *  ------------------------------------------------------------
 *  serverURL 填你部署好的 Waline 服务地址，例如：
 *    "https://your-waline.vercel.app"
 *
 *  留空则使用本地留言板（仅本地服务器可留言）。
 *  部署步骤见 https://waline.js.org/guide/deploy/vercel.html
 * ============================================================ */
window.KB_WALINE = {
  serverURL: ""
};

/* ============================================================
 *  留言板评论服务（线上让别人也能留言，最简单的方案）
 *  ------------------------------------------------------------
 *  使用 Utterances：基于 GitHub Issues，无需数据库、无需服务器。
 *  前提：在仓库上安装 Utterances App（一次即可）：
 *    https://github.com/apps/utterances  → Install → 选择 aemeath-kb
 *
 *  type = "utterances" 时用 Utterances（访客用 GitHub 账号留言）；
 *  type = "local"      时用本地留言板（只有本地能留言）。
 * ============================================================ */
window.KB_COMMENTS = {
  type: "utterances",
  repo: "rainyaozzz/aemeath-kb",
  issueTerm: "pathname",
  theme: "github-dark"
};
