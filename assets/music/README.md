# 音乐文件夹

把要播放的 mp3 文件放在这个目录里，然后在 `config.js` 的 `KB_MUSIC.songs` 里登记：

```js
window.KB_MUSIC = {
  volume: 0.6,
  songs: [
    { title: "星海轻歌", src: "assets/music/星海轻歌.mp3" }
  ]
};
```

刷新页面，顶部播放器就能选择这首歌并调节音量了。

也支持网络音频地址：

```js
{ title: "歌名", src: "https://example.com/song.mp3" }
```

> 注意：音乐受版权保护，请只使用你拥有授权或自己创作的文件。
