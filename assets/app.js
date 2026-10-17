/* ============================================================
   Rain的Aemeath知识库 · 前端逻辑
   Markdown 渲染 / 路由 / 目录 / 搜索 / 星空雪花背景
   ============================================================ */
(function () {
  'use strict';

  var SITE = window.KB_SITE || { title: '知识库', subtitle: '', home: 'home.md' };
  var NAV = window.KB_NAV || [];
  window.__DEV__ = false; // 只有本地服务器返回 /api/status 后才会变成 true

  // ---------- 工具 ----------
  function $(sel, root) { return (root || document).querySelector(sel); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 把标题里的英文单词包成 .en，方便和英文斜体字体统一
  function formatTitle(s) {
    return String(s).replace(/[A-Za-z]+/g, function (w) {
      return '<span class="en">' + w + '</span>';
    });
  }

  // ---------- 目录树扁平化 ----------
  var flatPages = [];   // { label, file, parents:[] }
  var fileMap = {};     // file -> flatPages entry
  var tree = [];        // 带 children 的树

  function prepare(items, parents) {
    parents = parents || [];
    return items.map(function (item) {
      var node = { label: item.label, accent: !!item.accent, children: null };
      if (item.children) {
        node.children = prepare(item.children, parents.concat(item.label));
      } else if (item.file) {
        node.file = item.file;
        var entry = { label: item.label, file: item.file, parents: parents.slice() };
        flatPages.push(entry);
        fileMap[item.file] = entry;
      }
      return node;
    });
  }

  // ---------- Markdown 渲染 ----------
  function slugify(text) {
    var id = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    return id || 'section';
  }

  function inline(text) {
    var stash = [];
    function hold(re, replacer) {
      text = text.replace(re, function () {
        var ph = '\u0000' + stash.length + '\u0000';
        stash.push(replacer.apply(null, arguments));
        return ph;
      });
    }

    // 行内代码
    hold(/`([^`\n]+)`/g, function (m, c) { return '<code>' + c + '</code>'; });
    // 图片
    hold(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, url) {
      return '<img src="' + url + '" alt="' + alt + '" loading="lazy">';
    });
    // 链接
    hold(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      var external = /^https?:\/\//i.test(url);
      var attr = external ? ' target="_blank" rel="noopener"' : '';
      return '<a href="' + url + '"' + attr + '>' + label + '</a>';
    });
    // 加粗
    hold(/\*\*([^*]+)\*\*/g, function (m, c) { return '<strong>' + c + '</strong>'; });
    hold(/__([^_]+)__/g, function (m, c) { return '<strong>' + c + '</strong>'; });
    // 删除线
    hold(/~~([^~]+)~~/g, function (m, c) { return '<del>' + c + '</del>'; });
    // 斜体
    hold(/\*([^*\n]+)\*/g, function (m, c) { return '<em>' + c + '</em>'; });

    return text.replace(/\u0000(\d+)\u0000/g, function (m, n) { return stash[+n]; });
  }

  function isBlockStart(line) {
    return /^\u0001\d+\u0001$/.test(line) ||
      /^#{1,6}\s/.test(line) ||
      /^\s*([-*_])(\s*\1){2,}\s*$/.test(line) ||
      /^\s*&gt;\s?/.test(line) ||
      /^\s*\|.*\|\s*$/.test(line) ||
      /^\s*([-*+]|\d+[.)])\s+/.test(line);
  }

  function renderBlocks(lines) {
    var html = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];

      if (/^\s*$/.test(line)) { i++; continue; }

      // 代码块占位
      if (/^\u0001\d+\u0001$/.test(line)) { html.push(line); i++; continue; }

      // 标题
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var level = h[1].length;
        var inner = inline(h[2]);
        var id = slugify(h[2].replace(/<[^>]*>/g, ''));
        html.push('<h' + level + ' id="' + id + '">' + inner + '</h' + level + '>');
        i++; continue;
      }

      // 分割线
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { html.push('<hr>'); i++; continue; }

      // 引用
      if (/^\s*&gt;\s?/.test(line)) {
        var buf = [];
        while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*&gt;\s?/, ''));
          i++;
        }
        html.push('<blockquote>' + renderBlocks(buf) + '</blockquote>');
        continue;
      }

      // 表格
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}.*\|/.test(lines[i + 1])) {
        var t = renderTable(lines, i);
        html.push(t.html);
        i = t.next;
        continue;
      }

      // 列表
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        var l = parseList(lines, i);
        html.push(l.html);
        i = l.next;
        continue;
      }

      // 段落
      var para = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      html.push('<p>' + inline(para.join(' ')) + '</p>');
    }
    return html.join('\n');
  }

  function renderTable(lines, i) {
    function cells(l) {
      return l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
    }
    var head = cells(lines[i]);
    i += 2;
    var rows = [];
    while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
      rows.push(cells(lines[i]));
      i++;
    }
    var out = '<div class="table-wrap"><table><thead><tr>';
    head.forEach(function (c) { out += '<th>' + inline(c) + '</th>'; });
    out += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      out += '<tr>';
      r.forEach(function (c) { out += '<td>' + inline(c) + '</td>'; });
      out += '</tr>';
    });
    out += '</tbody></table></div>';
    return { html: out, next: i };
  }

  function parseList(lines, start) {
    var first = lines[start].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    var indent = first[1].length;
    var ordered = /^\d/.test(first[2]);
    var items = [];
    var i = start;

    while (i < lines.length) {
      var line = lines[i];

      // 列表中的空行：若后面仍是同级或更深的列表项则跳过，否则结束
      if (/^\s*$/.test(line)) {
        var j = i + 1;
        while (j < lines.length && /^\s*$/.test(lines[j])) j++;
        if (j < lines.length) {
          var mm = lines[j].match(/^(\s*)([-*+]|\d+[.)])\s+/);
          if (mm && mm[1].length >= indent) { i = j; continue; }
        }
        break;
      }

      var m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (!m) break;
      var curIndent = m[1].length;
      if (curIndent < indent) break;

      if (curIndent > indent) {
        // 嵌套列表：作为上一个条目的子列表
        if (!items.length) { i++; continue; }
        var sub = parseList(lines, i);
        items[items.length - 1] = items[items.length - 1].replace(/<\/li>$/, '') + sub.html + '</li>';
        i = sub.next;
        continue;
      }

      // 同级条目（列表类型变化时，如无序→有序，另起一个新列表）
      if (/^\d/.test(m[2]) !== ordered) break;
      var text = m[3];
      i++;
      var extra = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && !/^\u0001\d+\u0001$/.test(lines[i])) {
        extra.push(lines[i]);
        i++;
      }
      var content = inline(text) + (extra.length ? ' ' + inline(extra.join(' ')) : '');
      items.push('<li>' + content + '</li>');
    }

    var tag = ordered ? 'ol' : 'ul';
    return { html: '<' + tag + '>' + items.join('') + '</' + tag + '>', next: i };
  }

  function renderMarkdown(src) {
    if (!src) return '';
    src = src.replace(/\r\n?/g, '\n');

    // 提取围栏代码块
    var codeBlocks = [];
    src = src.replace(/```([^\n`]*)\n([\s\S]*?)```/g, function (m, info, code) {
      var ph = '\u0001' + codeBlocks.length + '\u0001';
      var lang = info.trim();
      codeBlocks.push('<pre class="code"' + (lang ? ' data-lang="' + escapeHtml(lang) + '"' : '') + '><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>');
      return ph;
    });

    var html = renderBlocks(escapeHtml(src).split('\n'));
    html = html.replace(/\u0001(\d+)\u0001/g, function (m, n) { return codeBlocks[+n]; });
    return html;
  }

  // ---------- 星空 + 雪花背景 ----------
  function initSky() {
    var c = document.getElementById('sky');
    if (!c || !c.getContext) return;
    var ctx = c.getContext('2d');
    var W = 0, H = 0, stars = [], snow = [];
    var t = 0;

    function resize() {
      W = c.width = window.innerWidth;
      H = c.height = window.innerHeight;
      var i;
      stars = [];
      var n = Math.min(260, Math.floor(W * H / 5200));
      for (i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          r: Math.random() * 1.3 + 0.25,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 1.4,
          c: Math.random() < 0.45 ? '255,143,190' : '255,255,255'
        });
      }
      snow = [];
      var m = Math.min(140, Math.floor(W / 12));
      for (i = 0; i < m; i++) {
        snow.push({
          x: Math.random() * W, y: Math.random() * H,
          r: Math.random() * 2.0 + 0.5,
          vy: 0.25 + Math.random() * 0.85,
          vx: (Math.random() - 0.5) * 0.35,
          a: 0.18 + Math.random() * 0.45,
          sway: Math.random() * Math.PI * 2
        });
      }
    }

    function frame() {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);

      var i, s;
      for (i = 0; i < stars.length; i++) {
        s = stars[i];
        var tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.phase + t * s.speed));
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + s.c + ',' + (0.25 + 0.7 * tw).toFixed(3) + ')';
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (i = 0; i < snow.length; i++) {
        s = snow[i];
        s.y += s.vy;
        s.sway += 0.02;
        s.x += s.vx + Math.sin(s.sway) * 0.25;
        if (s.y > H + 6) { s.y = -6; s.x = Math.random() * W; }
        if (s.x > W + 6) s.x = -6;
        if (s.x < -6) s.x = W + 6;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(235,247,255,' + s.a.toFixed(3) + ')';
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
  }

  // ---------- 目录树渲染 ----------
  var tocEl, openKeys = {};

  function loadOpenState() {
    try { openKeys = JSON.parse(localStorage.getItem('aemeath-kb:open') || '{}'); } catch (e) { openKeys = {}; }
  }
  function saveOpenState() {
    try { localStorage.setItem('aemeath-kb:open', JSON.stringify(openKeys)); } catch (e) {}
  }

  function keyFor(item, parents) {
    return (parents || []).concat(item.label).join('/');
  }

  function buildTree(items, parents, indexPath) {
    var ul = document.createElement('ul');
    ul.className = 'tree';
    parents = parents || [];
    indexPath = indexPath || [];
    items.forEach(function (item, i) {
      var path = indexPath.concat(i);
      var pathStr = path.join('.');
      var li = document.createElement('li');
      li.dataset.navpath = pathStr;
      var row = document.createElement('div');
      row.className = 'tree-row';
      if (item.children || !item.file) {
        li.className = 'tree-group' + (item.accent ? ' accent' : '');
        var key = keyFor(item, parents);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tree-group-toggle';
        btn.innerHTML = '<span class="arrow">▸</span><span class="label">' + escapeHtml(item.label) + '</span>';
        btn.addEventListener('click', function () {
          var open = li.classList.toggle('open');
          openKeys[key] = open;
          saveOpenState();
        });
        row.appendChild(btn);
        row.appendChild(treeActions(pathStr, true));
        li.appendChild(row);
        li.appendChild(buildTree(item.children || [], parents.concat(item.label), path));
        if (openKeys[key] !== false) li.classList.add('open');
      } else {
        li.className = 'tree-page';
        var a = document.createElement('a');
        a.className = 'tree-link';
        a.href = '#' + item.file.replace(/\.md$/, '');
        a.textContent = item.label;
        row.appendChild(a);
        row.appendChild(treeActions(pathStr, false));
        li.appendChild(row);
      }
      ul.appendChild(li);
    });
    return ul;
  }

  function treeActions(pathStr, isGroup) {
    var span = document.createElement('span');
    span.className = 'tree-actions dev-only';
    var html = '';
    if (isGroup) {
      html += '<button type="button" data-act="add-group" data-path="' + pathStr + '" title="添加子分类">＋分类</button>';
      html += '<button type="button" data-act="add-page" data-path="' + pathStr + '" title="添加子页面">＋页面</button>';
    }
    html += '<button type="button" data-act="rename" data-path="' + pathStr + '" title="重命名">✎</button>';
    html += '<button type="button" data-act="delete" data-path="' + pathStr + '" title="删除">✕</button>';
    span.innerHTML = html;
    return span;
  }

  // ---------- 目录编辑（开发者模式） ----------
  function navNodeByPath(path) {
    var arr = NAV;
    var node = null;
    for (var i = 0; i < path.length; i++) {
      if (!arr) return null;
      node = arr[path[i]];
      if (!node) return null;
      arr = node.children;
    }
    return node;
  }

  function navParentByPath(path) {
    if (!path.length) return { arr: NAV, node: null };
    var parentPath = path.slice(0, -1);
    if (!parentPath.length) return { arr: NAV, node: null };
    var parent = navNodeByPath(parentPath);
    if (!parent) return null;
    if (!parent.children) parent.children = [];
    return { arr: parent.children, node: parent };
  }

  function rebuildNav() {
    flatPages = [];
    fileMap = {};
    tree = prepare(NAV, []);
    loadOpenState();
    renderToc();
    updateActive(currentFile);
  }

  function saveNav() {
    fetch('api/nav', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: askPass(), items: NAV })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.ok) alert('目录保存失败：' + ((res && res.error) || '未知错误'));
    }).catch(function () {
      alert('无法连接本地服务器，目录修改未保存');
    });
  }

  function addGroup(parentPath) {
    var label = prompt('新分类名称：');
    if (!label || !label.trim()) return;
    var parent = navParentByPath(parentPath);
    if (!parent) return;
    parent.arr.push({ label: label.trim(), children: [] });
    saveNav();
    rebuildNav();
  }

  function addPage(parentPath) {
    var label = prompt('新页面名称：');
    if (!label || !label.trim()) return;
    label = label.trim();
    var parent = navParentByPath(parentPath);
    if (!parent) return;
    var slug = slugify(label) || ('page-' + Date.now());
    var file = 'pages/' + slug + '.md';
    parent.arr.push({ label: label, file: file });
    fetch('api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: file, content: '# ' + label + '\n\n', password: askPass() })
    }).catch(function () {});
    saveNav();
    rebuildNav();
  }

  function renameNode(path) {
    var node = navNodeByPath(path);
    if (!node) return;
    var label = prompt('重命名为：', node.label);
    if (!label || !label.trim()) return;
    node.label = label.trim();
    saveNav();
    rebuildNav();
  }

  function deleteNode(path) {
    var node = navNodeByPath(path);
    if (!node) return;
    var extra = (node.children && node.children.length) ? '（含其下所有子目录）' : '';
    if (!confirm('确定删除「' + node.label + '」吗？' + extra)) return;
    var parent = navParentByPath(path);
    if (!parent) return;
    parent.arr.splice(path[path.length - 1], 1);
    saveNav();
    rebuildNav();
    if (currentFile && !fileMap[currentFile]) location.hash = 'home';
  }

  function renderToc() {
    tocEl.innerHTML = '';
    tocEl.appendChild(buildTree(tree, []));
  }

  function renderSearchResults(q) {
    q = q.toLowerCase();
    var results = [];
    flatPages.forEach(function (p) {
      var inLabel = p.label.toLowerCase().indexOf(q) !== -1;
      var inContent = cache[p.file] && cache[p.file].toLowerCase().indexOf(q) !== -1;
      if (inLabel || inContent) results.push(p);
    });
    if (!results.length) {
      tocEl.innerHTML = '<div class="toc-empty">没有找到与「' + escapeHtml(q) + '」相关的内容</div>';
      return;
    }
    var ul = document.createElement('ul');
    ul.className = 'tree';
    results.forEach(function (p) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'tree-link';
      a.href = '#' + p.file.replace(/\.md$/, '');
      a.textContent = p.label;
      li.appendChild(a);
      ul.appendChild(li);
    });
    tocEl.innerHTML = '';
    tocEl.appendChild(ul);
  }

  // ---------- 高亮当前页 ----------
  function updateActive(file) {
    var links = tocEl.querySelectorAll('.tree-link');
    links.forEach(function (a) {
      var h = a.getAttribute('href').replace(/^#/, '');
      var isActive = h === file.replace(/\.md$/, '');
      a.classList.toggle('active', isActive);
      var group = a.closest('.tree-group');
      if (group) group.classList.toggle('has-active', isActive);
    });
    // 展开当前页的所有祖先分组（仅在需要时重绘一次，避免无限递归）
    var entry = fileMap[file];
    if (entry && entry.parents.length) {
      var parents = entry.parents;
      var changed = false;
      for (var i = 0; i < parents.length; i++) {
        var trail = parents.slice(0, i + 1);
        var key = trail.join('/');
        if (!openKeys[key]) { openKeys[key] = true; saveOpenState(); changed = true; }
      }
      if (changed) {
        renderToc();
        updateActive(file);
      }
    }
  }

  function updateCrumb(file) {
    var entry = fileMap[file];
    var crumb = $('#crumb');
    if (!entry) { crumb.innerHTML = ''; return; }
    var parts = entry.parents.concat(entry.label);
    var html = parts.map(function (p, idx) {
      return (idx ? '<span class="sep">/</span>' : '') + '<span class="' + (idx === parts.length - 1 ? 'cur' : '') + '">' + escapeHtml(p) + '</span>';
    }).join('');
    crumb.innerHTML = html;
  }

  function updatePageNav(file) {
    var idx = flatPages.findIndex(function (p) { return p.file === file; });
    var nav = $('#pageNav');
    var prev = idx > 0 ? flatPages[idx - 1] : null;
    var next = idx >= 0 && idx < flatPages.length - 1 ? flatPages[idx + 1] : null;
    function btn(p, cls, dir) {
      if (!p) return '<a class="nav-btn ' + cls + ' spacer"></a>';
      return '<a class="nav-btn ' + cls + '" href="#' + p.file.replace(/\.md$/, '') + '">' +
        '<span class="dir">' + dir + '</span><span class="lbl">' + escapeHtml(p.label) + '</span></a>';
    }
    nav.innerHTML = btn(prev, 'prev', '← 上一页') + btn(next, 'next', '下一页 →');
  }

  // ---------- 页面加载 ----------
  var cache = {};

  function fileProtocolHelp() {
    if (location.protocol !== 'file:') return '';
    return '<div class="notice">检测到你直接用浏览器打开了本地文件（file://），Markdown 内容无法加载。<br>' +
      '请双击项目根目录下的 <code>预览.bat</code> 启动本地服务器，再访问 <code>http://localhost:8000</code>；' +
      '或把整个项目部署到 GitHub Pages 后访问。</div>';
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function loadAttachments(file) {
    if (!file || file === '__upload__') return;
    var dir = file.replace(/\.md$/, '');
    fetch('content/manifest.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (m) {
        if (!m) return;
        var contentEl = $('#content');
        if (!contentEl) return;
        var old = contentEl.querySelector('.attachments');
        if (old) old.remove();
        var files = (m[dir] || []).filter(function (f) {
          return !/^\./.test(f.name) && !/\.md$/i.test(f.name);
        });
        var subdirs = subDirsOf(dir, m);
        if (!files.length && !subdirs.length) return;
        var sec = document.createElement('section');
        sec.className = 'attachments';
        sec.innerHTML =
          '<h2 class="attach-title">📎 本页资料' +
          (window.__DEV__ ? '<button type="button" class="attach-add" data-dir="' + escapeHtml(dir) + '">＋ 新增分类</button>' : '') +
          '</h2>' +
          '<div class="attach-tree">' + renderAttachNode(dir, m) + '</div>';
        contentEl.appendChild(sec);
      })
      .catch(function () {});
  }

  function subDirsOf(dir, manifest) {
    var out = [];
    var prefix = dir ? dir + '/' : '';
    Object.keys(manifest).forEach(function (k) {
      if (k.indexOf(prefix) !== 0) return;
      var rest = k.slice(prefix.length);
      if (!rest) return;
      var top = rest.split('/')[0];
      if (top && out.indexOf(top) === -1) out.push(top);
    });
    out.sort();
    return out;
  }

  function renderAttachNode(dir, manifest) {
    var files = (manifest[dir] || []).filter(function (f) {
      return !/^\./.test(f.name) && !/\.md$/i.test(f.name);
    });
    var subdirs = subDirsOf(dir, manifest);
    var html = '';
    subdirs.forEach(function (name) {
      var sub = dir + '/' + name;
      html += '<details class="attach-dir">' +
        '<summary><span class="attach-dir-name">📁 ' + escapeHtml(name) + '</span>' +
        (window.__DEV__ ? '<button type="button" class="attach-add" data-dir="' + escapeHtml(sub) + '">＋</button>' : '') +
        '</summary>' +
        '<div class="attach-children">' + renderAttachNode(sub, manifest) + '</div>' +
        '</details>';
    });
    files.forEach(function (f) {
      html += '<div class="attach-file"><a href="' + escapeHtml(f.url) + '" target="_blank" rel="noopener">📄 ' +
        escapeHtml(f.name) + '</a><span class="attach-size">' + formatSize(f.size) + '</span></div>';
    });
    return html || '<div class="attach-empty">（空）</div>';
  }

  function addAttachDir(parentDir) {
    var name = prompt('新分类名称：');
    if (!name || !name.trim()) return;
    name = name.trim().replace(/[\/\\?%*:|"<>]/g, '_');
    var dir = (parentDir ? parentDir + '/' : '') + name;
    fetch('api/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: dir, password: askPass() })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.ok) loadAttachments(currentFile);
      else alert('创建分类失败：' + ((res && res.error) || '未知错误'));
    }).catch(function () { alert('无法连接本地服务器'); });
  }

  function render(file, text) {
    var contentEl = $('#content');
    contentEl.innerHTML = renderMarkdown(text);
    window.scrollTo({ top: 0 });
    updateCrumb(file);
    updateActive(file);
    updatePageNav(file);
    loadAttachments(file);
  }

  function loadPage(file) {
    currentFile = file;
    pushSite(file);
    document.body.classList.toggle('is-home', file === SITE.home);
    var contentEl = $('#content');
    updateCrumb(file);
    updateActive(file);
    updatePageNav(file);

    if (cache[file]) { render(file, cache[file]); return; }

    contentEl.innerHTML = '<div class="loading">✦ 载入中…</div>';
    fetch('content/' + file, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (t) {
        cache[file] = t;
        render(file, t);
      })
      .catch(function (e) {
        contentEl.innerHTML =
          '<div class="error">无法加载「' + escapeHtml(file) + '」：' + escapeHtml(e.message) + '</div>' +
          '<p class="dim" style="color:var(--text-faint)">请确认 <code>content/' + escapeHtml(file) + '</code> 文件存在，并通过本地服务器（而非 file:// 直接打开）访问。</p>' +
          fileProtocolHelp();
      });
  }

  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/+$/, '');
    if (h === 'upload') { renderUpload(); return; }
    if (h === 'guestbook') { renderGuestbook(); return; }
    var file = (h ? h + '.md' : SITE.home);
    if (!fileMap[file]) file = SITE.home;
    loadPage(file);
  }

  function buildUploadOptions() {
    var groups = {};
    var order = [];
    flatPages.forEach(function (p) {
      if (p.file === SITE.home) return;
      var g = p.parents.length ? p.parents[0] : '';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(p);
    });
    var html = '';
    order.forEach(function (g) {
      if (g) html += '<optgroup label="' + escapeHtml(g) + '">';
      groups[g].forEach(function (p) {
        var dir = p.file.replace(/\.md$/, '');
        html += '<option value="' + escapeHtml(dir) + '">' + escapeHtml(p.label) + '</option>';
      });
      if (g) html += '</optgroup>';
    });
    html += '<option value="">内容根目录</option>';
    return html;
  }

  // ---------- 上传资料 ----------
  function renderUpload() {
    currentFile = '__upload__';
    pushSite('__upload__');
    document.body.classList.remove('is-home');
    var crumb = $('#crumb');
    if (crumb) crumb.innerHTML = '<span class="cur">上传资料</span>';
    var nav = $('#pageNav');
    if (nav) nav.innerHTML = '';
    var contentEl = $('#content');
    var dev = !!window.__DEV__;
    contentEl.innerHTML = '' +
      '<div class="upload-page">' +
      '  <h1>上传资料</h1>' +
      '  <p class="upload-desc">选择分类后上传，文件会保存到 <code>content/&lt;分类&gt;/</code>。上传后可到 <code>config.js</code> 登记为新页面。</p>' +
      (dev ? '' : '<p class="upload-desc warn">当前是线上只读模式，上传功能需要在本地双击 <code>预览.bat</code> 时才能使用。</p>') +
      '  <form class="upload-form" id="uploadForm">' +
      '    <label class="upload-row"><span>上传密码</span><input type="password" id="uploadPass" placeholder="请输入上传密码" autocomplete="off"></label>' +
      '    <label class="upload-row"><span>上传到目录</span><select id="uploadFolder">' +
      buildUploadOptions() +
      '    </select></label>' +
      '    <label class="upload-row"><span>文件</span><input type="file" id="uploadFile"></label>' +
      '    <button type="submit" class="upload-btn"' + (dev ? '' : ' disabled') + '>开始上传</button>' +
      '    <div class="upload-status" id="uploadStatus"></div>' +
      '  </form>' +
      '</div>';
    bindUpload();
    if (window.__DEV__) {
      fetch('content/manifest.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function (m) {
          var sel = document.getElementById('uploadFolder');
          if (!sel || !m) return;
          var existing = {};
          Array.prototype.forEach.call(sel.querySelectorAll('option'), function (o) { existing[o.value] = true; });
          var extra = Object.keys(m).filter(function (k) { return k && !existing[k]; }).sort();
          if (!extra.length) return;
          var og = document.createElement('optgroup');
          og.label = '资料分类（本页资料内）';
          extra.forEach(function (k) {
            var o = document.createElement('option');
            o.value = k;
            o.textContent = '📁 ' + k;
            og.appendChild(o);
          });
          sel.appendChild(og);
        })
        .catch(function () {});
    }
    window.scrollTo({ top: 0 });
    if (tocEl) {
      tocEl.querySelectorAll('.tree-link').forEach(function (a) { a.classList.remove('active'); });
    }
  }

  function bindUpload() {
    var form = document.getElementById('uploadForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = document.getElementById('uploadStatus');
      if (!window.__DEV__) {
        if (status) { status.className = 'upload-status err'; status.textContent = '线上只读模式不能上传，请本地运行 预览.bat'; }
        return;
      }
      var passEl = document.getElementById('uploadPass');
      var input = document.getElementById('uploadFile');
      var folderEl = document.getElementById('uploadFolder');
      var pass = passEl ? passEl.value : '';
      var folder = folderEl ? folderEl.value : '';
      if (!input || !input.files || !input.files[0]) {
        if (status) { status.className = 'upload-status err'; status.textContent = '请先选择要上传的文件'; }
        return;
      }
      var file = input.files[0];
      if (status) { status.className = 'upload-status'; status.textContent = '上传中…'; }
      var reader = new FileReader();
      reader.onload = function () {
        fetch('api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pass, filename: file.name, data: reader.result, folder: folder })
        }).then(function (r) { return r.json(); }).then(function (res) {
          if (!status) return;
          if (res && res.ok) {
            status.className = 'upload-status ok';
            status.textContent = '✓ 上传成功：' + res.path;
          } else {
            status.className = 'upload-status err';
            status.textContent = '✕ 上传失败：' + ((res && res.error) || '未知错误');
          }
        }).catch(function () {
          if (!status) return;
          status.className = 'upload-status err';
          status.textContent = '✕ 无法连接服务器（请用 预览.bat 启动本地服务器）';
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- 留言板 ----------
  function renderGuestbook() {
    currentFile = '__guestbook__';
    pushSite('__guestbook__');
    document.body.classList.remove('is-home');
    var crumb = $('#crumb');
    if (crumb) crumb.innerHTML = '<span class="cur">留言板</span>';
    var nav = $('#pageNav');
    if (nav) nav.innerHTML = '';
    var contentEl = $('#content');
    contentEl.innerHTML = '<div class="gb"><div class="loading">✦ 载入中…</div></div>';
    var introPromise = fetch('content/guestbook.md', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .catch(function () { return ''; });
    var msgPromise = fetch('api/guestbook', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (res) { return (res && res.messages) || []; })
      .catch(function () {
        return fetch('content/guestbook.json', { cache: 'no-store' })
          .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
          .then(function (data) { return (data && data.messages) || []; })
          .catch(function () { return []; });
      });
    Promise.all([introPromise, msgPromise]).then(function (arr) {
      renderGuestbookContent(arr[0], arr[1] || []);
    });
  }

  function renderGuestbookContent(intro, messages) {
    var contentEl = $('#content');
    var walineCfg = window.KB_WALINE || {};
    var useWaline = !!(walineCfg.serverURL && String(walineCfg.serverURL).trim());
    var html = '' +
      '<div class="gb">' +
      '  <div class="gb-head">' +
      '    <button class="gb-back" id="gbBack" type="button">← 返回</button>' +
      (window.__DEV__ ? '<button class="gb-edit" id="gbEdit" type="button">✎ 编辑介绍</button>' : '') +
      '  </div>' +
      '  <div class="gb-intro">' + (intro ? renderMarkdown(intro) : '<p class="gb-empty">留言板介绍还没有写。</p>') + '</div>';
    if (useWaline) {
      html += '<div id="waline" class="gb-waline"></div>';
    } else {
      html += '<h2 class="gb-section">✍ 写留言</h2>' +
        '<form class="gb-form" id="gbForm">' +
        '<div class="gb-name-row">' +
        '<input class="gb-name" id="gbName" name="nick" type="text" maxlength="20" placeholder="你的昵称" autocomplete="off" spellcheck="false" autocapitalize="off">' +
        '<button class="gb-name-clear" id="gbNameClear" type="button" title="清除昵称">✕</button>' +
        '</div>' +
        '<textarea class="gb-text" id="gbText" rows="4" maxlength="500" placeholder="写点什么…"></textarea>' +
        '<div class="gb-form-foot"><button class="gb-submit" type="submit">发送留言</button><span class="gb-status" id="gbStatus"></span></div>' +
        '</form>' +
        '<h2 class="gb-section">💬 全部留言</h2>' +
        '<div class="gb-list" id="gbList"></div>';
    }
    html += '</div>';
    contentEl.innerHTML = html;
    bindGuestbookHead(intro);
    if (useWaline) {
      mountWaline(document.getElementById('waline'));
    } else {
      renderGuestbookList(messages);
      bindGuestbookForm(messages);
    }
    window.scrollTo({ top: 0 });
    if (tocEl) {
      tocEl.querySelectorAll('.tree-link').forEach(function (a) { a.classList.remove('active'); });
    }
  }

  function renderGuestbookList(messages) {
    var list = document.getElementById('gbList');
    if (!list) return;
    if (!messages || !messages.length) {
      list.innerHTML = '<div class="gb-empty">还没有留言，来抢个沙发吧～</div>';
      return;
    }
    list.innerHTML = messages.map(function (m, i) {
      return '<div class="gb-item">' +
        '<div class="gb-item-head">' +
        '<span class="gb-item-meta">' +
        '<span class="gb-item-name">' + escapeHtml(m.name || '') + '</span>' +
        '<span class="gb-item-time">' + escapeHtml(m.time || '') + '</span>' +
        '</span>' +
        (window.__DEV__ ? '<button class="gb-del" data-idx="' + i + '" type="button" title="删除留言">✕ 删除</button>' : '') +
        '</div>' +
        '<div class="gb-item-text">' + escapeHtml(m.text || '') + '</div>' +
        '</div>';
    }).join('');
    list.querySelectorAll('.gb-del').forEach(function (b) {
      b.addEventListener('click', function () {
        deleteMessage(+b.getAttribute('data-idx'), messages);
      });
    });
  }

  function deleteMessage(idx, messages) {
    if (!window.__DEV__) return;
    if (!confirm('确定删除这条留言吗？')) return;
    fetch('api/guestbook/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: idx, password: askPass() })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.ok) {
        messages.splice(idx, 1);
        renderGuestbookList(messages);
      } else {
        alert('删除失败：' + ((res && res.error) || '未知错误'));
      }
    }).catch(function () { alert('无法连接本地服务器'); });
  }

  function bindGuestbookHead(intro) {
    var back = document.getElementById('gbBack');
    if (back) back.addEventListener('click', goBackInSite);
    var editBtn = document.getElementById('gbEdit');
    if (editBtn) {
      editBtn.addEventListener('click', function () { openIntroEditor(intro); });
    }
  }

  function openIntroEditor(intro) {
    var box = document.querySelector('.gb-intro');
    if (!box) return;
    box.innerHTML = '<textarea class="gb-intro-edit" id="gbIntroEdit"></textarea>' +
      '<div class="gb-intro-actions"><button id="gbIntroSave" type="button">保存</button><button id="gbIntroCancel" type="button">取消</button></div>';
    var ta = document.getElementById('gbIntroEdit');
    ta.value = intro || '';
    document.getElementById('gbIntroCancel').addEventListener('click', function () { renderGuestbook(); });
    document.getElementById('gbIntroSave').addEventListener('click', function () {
      fetch('api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: 'guestbook.md', content: ta.value, password: askPass() })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.ok) renderGuestbook();
        else alert('保存失败：' + ((res && res.error) || '未知错误'));
      }).catch(function () { alert('无法连接本地服务器'); });
    });
  }

  function bindGuestbookForm(messages) {
    var form = document.getElementById('gbForm');
    if (!form) return;
    var nameEl = document.getElementById('gbName');
    var textEl = document.getElementById('gbText');
    try {
      var savedNick = localStorage.getItem('aemeath-kb:nick');
      if (savedNick && nameEl) nameEl.value = savedNick;
    } catch (e) {}
    var clearBtn = document.getElementById('gbNameClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (nameEl) { nameEl.value = ''; nameEl.focus(); }
        try { localStorage.removeItem('aemeath-kb:nick'); } catch (e) {}
      });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = nameEl ? nameEl.value.trim() : '';
      var text = textEl ? textEl.value.trim() : '';
      var status = document.getElementById('gbStatus');
      if (!name) { status.textContent = '请填写昵称'; return; }
      if (!text) { status.textContent = '请写点内容'; return; }
      try { localStorage.setItem('aemeath-kb:nick', name); } catch (e) {}
      status.textContent = '发送中…';
      fetch('api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, text: text })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.ok) {
          document.getElementById('gbText').value = '';
          messages.unshift(res.message);
          renderGuestbookList(messages);
          status.textContent = '';
        } else {
          status.textContent = '发送失败：' + ((res && res.error) || '未知错误');
        }
      }).catch(function () {
        status.textContent = '无法连接服务器（线上只读，需本地运行 预览.bat）';
      });
    });
  }

  function mountWaline(el) {
    if (!el) return;
    var cfg = window.KB_WALINE || {};
    var url = String(cfg.serverURL || '').trim();
    if (!url) return;
    function init() {
      if (window.Waline && window.Waline.init) {
        window.Waline.init({
          el: el,
          serverURL: url,
          lang: 'zh-CN',
          login: 'disable',
          requiredMeta: ['nick'],
          pageview: false
        });
      }
    }
    if (!document.getElementById('waline-css')) {
      var css = document.createElement('link');
      css.id = 'waline-css';
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/@waline/client@v3/dist/waline.css';
      document.head.appendChild(css);
    }
    if (window.Waline && window.Waline.init) { init(); return; }
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/@waline/client@v3/dist/waline.js';
    script.onload = init;
    document.head.appendChild(script);
  }

  // ---------- 预取所有页面（用于搜索） ----------
  function prefetchAll() {
    flatPages.forEach(function (p) {
      if (cache[p.file]) return;
      fetch('content/' + p.file, { cache: 'no-cache' })
        .then(function (r) { if (r.ok) return r.text(); throw new Error(); })
        .then(function (t) { cache[p.file] = t; })
        .catch(function () {});
    });
  }

  // ---------- 侧边栏开关（移动端） ----------
  function setupSidebar() {
    var sidebar = $('#sidebar');
    var backdrop = $('#backdrop');
    function open() { sidebar.classList.add('open'); backdrop.classList.add('show'); }
    function close() { sidebar.classList.remove('open'); backdrop.classList.remove('show'); }
    $('#sidebarOpen').addEventListener('click', open);
    $('#sidebarClose').addEventListener('click', close);
    backdrop.addEventListener('click', close);
  }

  // ---------- 返回上一页（始终在站内，绝不会退出网站） ----------
  var siteStack = [];

  function pushSite(file) {
    if (!file) return;
    var idx = -1;
    for (var i = siteStack.length - 1; i >= 0; i--) {
      if (siteStack[i] === file) { idx = i; break; }
    }
    if (idx !== -1) siteStack.length = idx + 1;
    else siteStack.push(file);
  }

  function goBackInSite() {
    if (siteStack.length && siteStack[siteStack.length - 1] === currentFile) {
      siteStack.pop();
    }
    while (siteStack.length && (siteStack[siteStack.length - 1] === '__upload__' || siteStack[siteStack.length - 1] === '__guestbook__')) {
      siteStack.pop();
    }
    var prev = siteStack[siteStack.length - 1];
    if (prev && fileMap[prev]) {
      location.hash = prev.replace(/\.md$/, '');
    } else {
      location.hash = 'home';
    }
  }

  function setupBack() {
    var btn = document.getElementById('sideBack');
    if (!btn) return;
    btn.addEventListener('click', goBackInSite);
  }

  // ---------- 音乐播放器 ----------
  function setupMusic() {
    var audio = document.getElementById('mbAudio');
    var btn = document.getElementById('mbPlay');
    var sel = document.getElementById('mbSelect');
    var vol = document.getElementById('mbVolume');
    var title = document.getElementById('mbTitle');
    if (!audio || !btn || !sel || !vol) return;
    var music = window.KB_MUSIC || {};
    var songs = [];

    var savedVol = null;
    try { savedVol = localStorage.getItem('aemeath-kb:volume'); } catch (e) {}
    audio.volume = savedVol != null ? (+savedVol) / 100 : (music.volume != null ? music.volume : 0.6);
    vol.value = Math.round(audio.volume * 100);

    function load(i) {
      var s = songs[i];
      if (!s) return;
      audio.src = s.src;
      if (title) title.textContent = s.title || '';
      audio.load();
    }

    function buildSelect() {
      sel.innerHTML = '';
      if (!songs.length) {
        sel.innerHTML = '<option>暂无歌曲</option>';
        sel.disabled = true;
        btn.disabled = true;
        if (title) title.textContent = '星海轻歌 · 暂无歌曲';
        return;
      }
      sel.disabled = false;
      btn.disabled = false;
      songs.forEach(function (s, i) {
        var o = document.createElement('option');
        o.value = i;
        o.textContent = s.title || ('歌曲 ' + (i + 1));
        sel.appendChild(o);
      });
      sel.value = 0;
      load(0);
    }

    btn.addEventListener('click', function () {
      if (audio.paused) {
        audio.play().then(function () { btn.textContent = '❚❚'; }).catch(function () {});
      } else {
        audio.pause();
      }
    });
    audio.addEventListener('play', function () { btn.textContent = '❚❚'; });
    audio.addEventListener('pause', function () { btn.textContent = '▶'; });
    audio.addEventListener('ended', function () {
      if (!songs.length) return;
      var next = ((+sel.value || 0) + 1) % songs.length;
      sel.value = next;
      load(next);
      audio.play().catch(function () {});
    });
    sel.addEventListener('change', function () { load(+sel.value); });
    vol.addEventListener('input', function () {
      audio.volume = (+vol.value) / 100;
      try { localStorage.setItem('aemeath-kb:volume', vol.value); } catch (e) {}
    });

    // 上传歌曲（开发者模式）
    var upBtn = document.getElementById('mbUpload');
    var fileInput = document.getElementById('mbFile');
    if (upBtn && fileInput) {
      upBtn.addEventListener('click', function () {
        if (!window.__DEV__) { alert('上传歌曲需要本地运行 预览.bat'); return; }
        fileInput.click();
      });
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        if (!window.__DEV__) { alert('上传歌曲需要本地运行 预览.bat'); return; }
        var reader = new FileReader();
        reader.onload = function () {
          fetch('api/music', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: askPass(), filename: f.name, data: reader.result })
          }).then(function (r) { return r.json(); }).then(function (res) {
            if (res && res.ok) {
              songs.push({ title: res.title, src: res.src });
              buildSelect();
              sel.value = songs.length - 1;
              load(songs.length - 1);
            } else {
              alert('上传失败：' + ((res && res.error) || '未知错误'));
            }
          }).catch(function () { alert('无法连接本地服务器'); });
        };
        reader.readAsDataURL(f);
        fileInput.value = '';
      });
    }

    songs = (music.songs || []).slice();
    buildSelect();
    fetch('content/music.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) {
        if (data && data.songs && data.songs.length) {
          songs = data.songs.slice();
          buildSelect();
        }
      })
      .catch(function () {});
  }

  // ---------- 开发者编辑模式（只有本地服务器才开启） ----------
  var devPass = '';

  function askPass() {
    if (!devPass) devPass = window.prompt('请输入编辑密码：') || '';
    return devPass;
  }

  function setupDevMode() {
    fetch('api/status', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('static'); return r.json(); })
      .then(function (j) {
        if (!j || !j.dev) return;
        window.__DEV__ = true;
        document.body.classList.add('dev-mode');
        var btn = document.getElementById('editBtn');
        if (btn) {
          btn.addEventListener('click', function () {
            if (!currentFile || currentFile === '__upload__') return;
            enterEdit(currentFile);
          });
        }
        var navAdd = document.getElementById('navAdd');
        if (navAdd) navAdd.addEventListener('click', function () { addGroup([]); });
        if (tocEl) {
          tocEl.addEventListener('click', function (e) {
            var b = e.target.closest('[data-act]');
            if (!b) return;
            e.preventDefault();
            e.stopPropagation();
            var pathStr = b.getAttribute('data-path') || '';
            var path = pathStr ? pathStr.split('.').map(Number) : [];
            var act = b.getAttribute('data-act');
            if (act === 'add-group') addGroup(path);
            else if (act === 'add-page') addPage(path);
            else if (act === 'rename') renameNode(path);
            else if (act === 'delete') deleteNode(path);
          });
        }
        document.addEventListener('click', function (e) {
          var b = e.target.closest('.attach-add');
          if (!b) return;
          e.preventDefault();
          e.stopPropagation();
          addAttachDir(b.getAttribute('data-dir'));
        });
      })
      .catch(function () { /* 静态托管：只读模式 */ });
  }

  function enterEdit(file) {
    if (!window.__DEV__ || !file || file === '__upload__') return;
    if (cache[file] !== undefined) { showEditor(file, cache[file]); return; }
    var contentEl = $('#content');
    contentEl.innerHTML = '<div class="loading">✦ 载入中…</div>';
    fetch('content/' + file, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
      .then(function (t) { cache[file] = t; showEditor(file, t); })
      .catch(function () { contentEl.innerHTML = '<div class="error">无法载入该页内容</div>'; });
  }

  function showEditor(file, text) {
    var contentEl = $('#content');
    contentEl.innerHTML = '' +
      '<div class="edit-toolbar">' +
      '  <span class="edit-title">编辑：' + escapeHtml(file) + '</span>' +
      '  <button id="saveEdit" class="edit-save" type="button">保存</button>' +
      '  <button id="cancelEdit" class="edit-cancel" type="button">取消</button>' +
      '  <span id="editStatus" class="edit-status"></span>' +
      '</div>' +
      '<textarea id="editArea" class="edit-area" spellcheck="false"></textarea>';
    var ta = document.getElementById('editArea');
    ta.value = text;
    document.getElementById('cancelEdit').addEventListener('click', function () {
      render(file, text);
    });
    document.getElementById('saveEdit').addEventListener('click', function () {
      var status = document.getElementById('editStatus');
      var pass = askPass();
      status.className = 'edit-status';
      status.textContent = '保存中…';
      fetch('api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: file, content: ta.value, password: pass })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.ok) {
          cache[file] = ta.value;
          render(file, ta.value);
        } else {
          devPass = '';
          status.className = 'edit-status err';
          status.textContent = '✕ ' + ((res && res.error) || '保存失败');
        }
      }).catch(function () {
        status.className = 'edit-status err';
        status.textContent = '✕ 无法连接本地服务器';
      });
    });
  }

  // ---------- 键盘快捷键 ----------
  function setupKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== $('#search')) {
        e.preventDefault();
        $('#search').focus();
      }
      if (document.activeElement === $('#search') || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      var idx = flatPages.findIndex(function (p) { return p.file === currentFile; });
      if (e.key === 'ArrowRight' && idx < flatPages.length - 1) {
        location.hash = flatPages[idx + 1].file.replace(/\.md$/, '');
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        location.hash = flatPages[idx - 1].file.replace(/\.md$/, '');
      }
    });
  }

  // ---------- 头图 / 置顶动态 ----------
  function buildHero() {
    var hero = SITE.hero || {};

    var titleEl = $('#heroTitle');
    if (titleEl) titleEl.innerHTML = formatTitle(SITE.title);

    var subEl = $('#heroSub');
    if (subEl) subEl.textContent = SITE.subtitle;

    var metaEl = $('#heroMeta');
    if (metaEl) {
      if (hero.meta) metaEl.textContent = hero.meta;
      else metaEl.style.display = 'none';
    }

    var chipsEl = $('#heroChips');
    if (chipsEl) {
      chipsEl.innerHTML = '';
      var chips = hero.chips || [];
      chips.forEach(function (c) {
        var span = document.createElement('span');
        span.className = 'chip';
        span.textContent = '✦ ' + c;
        chipsEl.appendChild(span);
      });
      if (!chips.length) chipsEl.style.display = 'none';
    }

    var waveEl = $('#songWave');
    if (waveEl) {
      waveEl.innerHTML = '';
      for (var i = 0; i < 22; i++) {
        var bar = document.createElement('i');
        bar.style.animationDelay = (i * 0.085) + 's';
        bar.style.animationDuration = (1.05 + (i % 5) * 0.16) + 's';
        waveEl.appendChild(bar);
      }
    }

    var pinned = hero.pinned || {};
    var lbl = $('#pinnedLabel');
    if (lbl && pinned.label) lbl.textContent = pinned.label;
    var pbody = $('#pinnedBody');
    if (pbody && pinned.body) pbody.textContent = pinned.body;
    var psign = $('#pinnedSign');
    if (psign && pinned.sign) psign.textContent = pinned.sign;
  }

  // ---------- 桌宠（Q版精灵：待机 / 四处走动） ----------
  function setupPet() {
    var pet = document.getElementById('pet');
    var sprite = document.getElementById('petSprite');
    if (!pet || !sprite) return;

    var FW = 96, FH = 104;
    var REDUCE = false;
    try { REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var IDLE = { row: 0, count: 6 };
    var WALK = { row: 1, count: 8 };
    var LINE = ['在星海轻歌~', '晚安，旅人。', '雪豹又抢走我的耳机了…', '新歌的副歌，写给你。', '星炬学院，下课啦。', '今天的星星，很亮。'];

    var x = 0, y = 0;
    var facing = 1;
    var state = 'idle';
    var action = IDLE;
    var frame = 0;
    var frameClock = 0;
    var stateClock = 0;
    var tx = 0, ty = 0;

    function rand(a, b) { return a + Math.random() * (b - a); }
    function clampX(v) {
      var minX = window.innerWidth > 860 ? 316 : 10;
      return Math.max(minX, Math.min(window.innerWidth - FW - 10, v));
    }
    function clampY(v) {
      return Math.max(64, Math.min(window.innerHeight - FH - 12, v));
    }

    function paintFrame() {
      var c = frame % action.count;
      sprite.style.backgroundPosition = (-c * FW) + 'px ' + (-action.row * FH) + 'px';
    }
    function paintFacing() {
      sprite.style.transform = facing < 0 ? 'scaleX(-1)' : 'scaleX(1)';
    }
    function paintPos() {
      pet.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    }

    function toIdle() {
      state = 'idle';
      action = IDLE;
      frame = 0;
      frameClock = 0;
      stateClock = rand(2400, 5200);
      paintFrame();
    }
    function toWander() {
      if (REDUCE) { toIdle(); return; }
      state = 'wander';
      action = WALK;
      frame = 0;
      frameClock = 0;
      stateClock = rand(2800, 6200);
      var top = window.innerHeight * 0.42;
      tx = clampX(rand(40, window.innerWidth - FW - 40));
      ty = clampY(rand(top, window.innerHeight - FH - 20));
      paintFrame();
    }

    function speak() {
      var love = document.getElementById('petLove');
      if (love) {
        love.classList.remove('pop');
        void love.offsetWidth;
        love.classList.add('pop');
      }
      var bubble = document.getElementById('petBubble');
      if (!bubble) return;
      bubble.textContent = LINE[Math.floor(Math.random() * LINE.length)];
      pet.classList.add('show');
      clearTimeout(speak._t);
      speak._t = setTimeout(function () { pet.classList.remove('show'); }, 2600);
    }

    // 初始：右下角待机
    x = clampX(window.innerWidth - FW - 22);
    y = clampY(window.innerHeight - FH - 20);
    paintPos(); paintFacing(); toIdle();
    pet.style.opacity = '1';

    pet.addEventListener('click', speak);
    pet.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); speak(); }
    });
    window.addEventListener('resize', function () {
      x = clampX(x); y = clampY(y); paintPos();
    });

    var last = 0;
    function loop(t) {
      if (!last) last = t;
      var dt = Math.min(60, t - last);
      last = t;

      frameClock += dt;
      if (frameClock >= (state === 'wander' ? 90 : 140)) {
        frameClock = 0;
        frame = (frame + 1) % action.count;
        paintFrame();
      }

      if (state === 'wander') {
        var dx = tx - x, dy = ty - y;
        var dist = Math.hypot(dx, dy);
        if (dist < 4) {
          if (Math.random() < 0.4) toIdle(); else toWander();
        } else {
          var step = 105 * dt / 1000;
          x += (dx / dist) * step;
          y += (dy / dist) * step;
          if (Math.abs(dx) > 0.8) { facing = dx < 0 ? -1 : 1; paintFacing(); }
          paintPos();
        }
      }

      stateClock -= dt;
      if (stateClock <= 0) {
        if (state === 'idle') toWander(); else toIdle();
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // ---------- 初始化 ----------
  var currentFile = null;

  function init() {
    tocEl = $('#toc');
    tree = prepare(NAV, []);
    $('#brandTitle').innerHTML = formatTitle(SITE.title);
    $('#brandSub').textContent = SITE.subtitle;
    document.title = SITE.title;
    buildHero();
    setupPet();

    loadOpenState();
    renderToc();
    setupSidebar();
    setupBack();
    setupMusic();
    setupDevMode();
    setupKeyboard();
    initSky();

    var searchEl = $('#search');
    searchEl.addEventListener('input', function () {
      var q = this.value.trim();
      if (q) renderSearchResults(q); else renderToc();
    });

    window.addEventListener('hashchange', route);

    if (location.protocol === 'file:') {
      $('#content').innerHTML = fileProtocolHelp() +
        '<p style="color:var(--text-faint)">目录在左侧可用，但正文内容需要本地服务器才能加载。</p>';
      $('#pageNav').innerHTML = '';
    } else {
      route();
      prefetchAll();
      fetch('content/nav.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function (data) {
          if (data && data.items && data.items.length) {
            NAV = data.items;
            rebuildNav();
          }
        })
        .catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
