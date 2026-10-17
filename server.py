#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Rain的Aemeath知识库 · 本地服务器（开发者模式）

- /             : 提供静态网站
- /api/status   : 前端用来判断当前是否在「本地开发者模式」（只有本地会返回 dev=true）
- /api/save     : 保存网页正文（需要密码）
- /api/upload   : 上传文件到指定分类目录（需要密码）

只有双击 预览.bat 在本地运行时，这些接口才存在；
部署到 GitHub Pages 等静态托管后，接口不存在，网站自动变成只读。
"""
import os
import json
import base64
from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingTCPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
CONTENT_DIR = os.path.join(ROOT, "content")

# ============================================================
#  ⚠️ 编辑 / 上传密码：改成你自己的密码
# ============================================================
PASSWORD = "yre20080614"

MAX_SIZE = 20 * 1024 * 1024  # 单文件上限 20MB

def safe_subdir(folder):
    """把前端传来的相对目录（如 math/calculus）解析成 content 下的安全绝对路径。"""
    folder = (folder or "").replace("\\", "/").strip()
    segs = [s for s in folder.split("/") if s not in ("", ".")]
    if any(s == ".." for s in segs):
        return None
    target = os.path.join(CONTENT_DIR, *segs) if segs else CONTENT_DIR
    content_abs = os.path.abspath(CONTENT_DIR)
    target_abs = os.path.abspath(target)
    if target_abs != content_abs and not target_abs.startswith(content_abs + os.sep):
        return None
    return target


def build_manifest():
    """扫描 content 目录，生成 content/manifest.json，供前端展示每页的资料。"""
    manifest = {}
    for dirpath, dirnames, filenames in os.walk(CONTENT_DIR):
        rel_dir = os.path.relpath(dirpath, CONTENT_DIR).replace("\\", "/")
        if rel_dir == ".":
            rel_dir = ""
        files = []
        for fn in sorted(filenames):
            if fn in ("manifest.json", "nav.json", "music.json", "guestbook.json"):
                continue
            full = os.path.join(dirpath, fn)
            rel = (rel_dir + "/" + fn) if rel_dir else fn
            files.append({"name": fn, "size": os.path.getsize(full), "url": "content/" + rel})
        if files:
            manifest[rel_dir] = files
    path = os.path.join(CONTENT_DIR, "manifest.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    return manifest


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/status":
            self.send_json(200, {"ok": True, "dev": True})
            return
        if path == "/api/guestbook":
            self.handle_guestbook_get()
            return
        # 不把服务器脚本/批处理暴露成静态文件
        if path.lower().endswith((".py", ".bat")):
            self.send_error(403, "Forbidden")
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/upload":
            self.handle_upload()
        elif path == "/api/save":
            self.handle_save()
        elif path == "/api/nav":
            self.handle_nav()
        elif path == "/api/mkdir":
            self.handle_mkdir()
        elif path == "/api/music":
            self.handle_music()
        elif path == "/api/guestbook":
            self.handle_guestbook_post()
        elif path == "/api/guestbook/delete":
            self.handle_guestbook_delete()
        else:
            self.send_error(404, "Not Found")

    # ---------- 上传文件到分类目录 ----------
    def handle_upload(self):
        payload = self.read_json()
        if payload is None:
            return
        if payload.get("password") != PASSWORD:
            self.send_json(403, {"ok": False, "error": "密码错误"})
            return
        filename = os.path.basename(str(payload.get("filename") or "").strip())
        folder = str(payload.get("folder") or "").strip()
        data = payload.get("data") or ""
        target_dir = safe_subdir(folder)
        if target_dir is None:
            self.send_json(400, {"ok": False, "error": "无效的目录"})
            return
        if not filename or not data:
            self.send_json(400, {"ok": False, "error": "缺少文件名或内容"})
            return
        try:
            raw = base64.b64decode(str(data).split(",")[-1])
        except Exception:
            self.send_json(400, {"ok": False, "error": "文件编码错误"})
            return
        if len(raw) > MAX_SIZE:
            self.send_json(413, {"ok": False, "error": "文件超过 20MB"})
            return
        safe = filename.replace("/", "_").replace("\\", "_").replace("..", "_")
        os.makedirs(target_dir, exist_ok=True)
        target = os.path.join(target_dir, safe)
        try:
            with open(target, "wb") as f:
                f.write(raw)
            build_manifest()
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "保存失败：" + str(e)})
            return
        rel = os.path.relpath(target, ROOT).replace("\\", "/")
        self.send_json(200, {"ok": True, "path": rel, "size": len(raw)})

    # ---------- 保存网页正文 ----------
    def handle_save(self):
        payload = self.read_json()
        if payload is None:
            return
        if payload.get("password") != PASSWORD:
            self.send_json(403, {"ok": False, "error": "密码错误"})
            return
        rel = str(payload.get("file") or "").strip().replace("\\", "/")
        content = payload.get("content")
        if not rel or content is None:
            self.send_json(400, {"ok": False, "error": "缺少文件或内容"})
            return
        parts = [p for p in rel.split("/") if p not in ("", ".")]
        if not parts or ".." in parts:
            self.send_json(400, {"ok": False, "error": "非法路径"})
            return
        if parts[0] != "content":
            parts = ["content"] + parts
        rel_norm = "/".join(parts)
        full = os.path.join(ROOT, *parts)
        content_abs = os.path.abspath(CONTENT_DIR)
        full_abs = os.path.abspath(full)
        if not (full_abs == content_abs or full_abs.startswith(content_abs + os.sep)):
            self.send_json(400, {"ok": False, "error": "非法路径"})
            return
        try:
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "保存失败：" + str(e)})
            return
        self.send_json(200, {"ok": True, "file": rel_norm})

    # ---------- 保存目录结构 ----------
    def handle_nav(self):
        payload = self.read_json()
        if payload is None:
            return
        if payload.get("password") != PASSWORD:
            self.send_json(403, {"ok": False, "error": "密码错误"})
            return
        items = payload.get("items")
        if not isinstance(items, list):
            self.send_json(400, {"ok": False, "error": "目录格式错误"})
            return
        try:
            path = os.path.join(CONTENT_DIR, "nav.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"items": items}, f, ensure_ascii=False, indent=1)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "保存失败：" + str(e)})
            return
        self.send_json(200, {"ok": True})

    # ---------- 新建资料分类（子目录） ----------
    def handle_mkdir(self):
        payload = self.read_json()
        if payload is None:
            return
        if payload.get("password") != PASSWORD:
            self.send_json(403, {"ok": False, "error": "密码错误"})
            return
        rel = str(payload.get("dir") or "").strip()
        target = safe_subdir(rel)
        if target is None or not rel:
            self.send_json(400, {"ok": False, "error": "无效的目录"})
            return
        try:
            os.makedirs(target, exist_ok=True)
            keep = os.path.join(target, ".keep")
            if not os.path.exists(keep):
                with open(keep, "w", encoding="utf-8") as f:
                    f.write("")
            build_manifest()
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "创建失败：" + str(e)})
            return
        self.send_json(200, {"ok": True, "dir": rel})

    # ---------- 上传歌曲 ----------
    def handle_music(self):
        payload = self.read_json()
        if payload is None:
            return
        if payload.get("password") != PASSWORD:
            self.send_json(403, {"ok": False, "error": "密码错误"})
            return
        filename = os.path.basename(str(payload.get("filename") or "").strip())
        data = payload.get("data") or ""
        if not filename or not data:
            self.send_json(400, {"ok": False, "error": "缺少文件或内容"})
            return
        try:
            raw = base64.b64decode(str(data).split(",")[-1])
        except Exception:
            self.send_json(400, {"ok": False, "error": "文件编码错误"})
            return
        if len(raw) > 60 * 1024 * 1024:
            self.send_json(413, {"ok": False, "error": "文件超过 60MB"})
            return
        safe = filename.replace("/", "_").replace("\\", "_").replace("..", "_")
        music_dir = os.path.join(ROOT, "assets", "music")
        os.makedirs(music_dir, exist_ok=True)
        target = os.path.join(music_dir, safe)
        try:
            with open(target, "wb") as f:
                f.write(raw)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "保存失败：" + str(e)})
            return
        src = "assets/music/" + safe
        title = safe.rsplit(".", 1)[0]
        music_json = os.path.join(CONTENT_DIR, "music.json")
        try:
            if os.path.exists(music_json):
                with open(music_json, "r", encoding="utf-8-sig") as f:
                    obj = json.load(f)
            else:
                obj = {"songs": []}
            songs = obj.get("songs") or []
            if not any(s.get("src") == src for s in songs):
                songs.append({"title": title, "src": src})
            obj["songs"] = songs
            with open(music_json, "w", encoding="utf-8") as f:
                json.dump(obj, f, ensure_ascii=False, indent=1)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "写入歌单失败：" + str(e)})
            return
        self.send_json(200, {"ok": True, "src": src, "title": title})

    # ---------- 留言板 ----------
    def handle_guestbook_get(self):
        path = os.path.join(CONTENT_DIR, "guestbook.json")
        try:
            with open(path, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
        except Exception:
            data = {"messages": []}
        self.send_json(200, {"ok": True, "messages": data.get("messages", [])})

    def handle_guestbook_post(self):
        payload = self.read_json()
        if payload is None:
            return
        name = str(payload.get("name") or "").strip()[:20]
        text = str(payload.get("text") or "").strip()[:500]
        if not name or not text:
            self.send_json(400, {"ok": False, "error": "昵称和内容不能为空"})
            return
        path = os.path.join(CONTENT_DIR, "guestbook.json")
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8-sig") as f:
                    data = json.load(f)
            else:
                data = {"messages": []}
            msgs = data.get("messages") or []
            from datetime import datetime
            msg = {"name": name, "text": text, "time": datetime.now().strftime("%Y-%m-%d %H:%M")}
            msgs.insert(0, msg)
            data["messages"] = msgs[:500]
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "保存失败：" + str(e)})
            return
        self.send_json(200, {"ok": True, "message": msg})

    def handle_guestbook_delete(self):
        payload = self.read_json()
        if payload is None:
            return
        if payload.get("password") != PASSWORD:
            self.send_json(403, {"ok": False, "error": "密码错误"})
            return
        try:
            idx = int(payload.get("index"))
        except Exception:
            self.send_json(400, {"ok": False, "error": "参数错误"})
            return
        path = os.path.join(CONTENT_DIR, "guestbook.json")
        try:
            if not os.path.exists(path):
                self.send_json(404, {"ok": False, "error": "留言板为空"})
                return
            with open(path, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
            msgs = data.get("messages") or []
            if idx < 0 or idx >= len(msgs):
                self.send_json(400, {"ok": False, "error": "留言不存在"})
                return
            msgs.pop(idx)
            data["messages"] = msgs
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "删除失败：" + str(e)})
            return
        self.send_json(200, {"ok": True})

    # ---------- 工具 ----------
    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            self.send_json(400, {"ok": False, "error": "请求无效"})
            return None
        if length <= 0 or length > MAX_SIZE * 2:
            self.send_json(413, {"ok": False, "error": "请求为空或过大"})
            return None
        body = self.rfile.read(length)
        try:
            return json.loads(body.decode("utf-8"))
        except Exception:
            self.send_json(400, {"ok": False, "error": "请求格式错误"})
            return None

    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    try:
        build_manifest()
    except Exception:
        pass
    port = int(os.environ.get("PORT", "8000"))
    with ThreadingTCPServer(("127.0.0.1", port), Handler) as httpd:
        print("Rain的Aemeath知识库 · 本地服务器（开发者模式）")
        print("访问地址: http://localhost:%d" % port)
        print("编辑 / 上传密码见本文件顶部的 PASSWORD")
        print("按 Ctrl+C 停止")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
