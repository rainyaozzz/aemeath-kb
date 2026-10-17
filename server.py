#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Rain的Aemeath知识库 · 本地服务器
- 提供静态网站服务
- 提供 /api/upload 上传接口（需要密码）
上传的文件会保存到本目录下的 content/uploads/
"""
import os
import json
import base64
from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingTCPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(ROOT, "content", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ============================================================
#  ⚠️ 上传密码：改成你自己的密码
# ============================================================
PASSWORD = "yre20080614"

MAX_SIZE = 20 * 1024 * 1024  # 单文件上限 20MB


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # 不把服务器脚本/批处理暴露成静态文件
    def do_GET(self):
        path = self.path.split("?")[0].lower()
        if path.endswith(".py") or path.endswith(".bat"):
            self.send_error(403, "Forbidden")
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/upload":
            self.send_error(404, "Not Found")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            self.send_json(400, {"ok": False, "error": "请求无效"})
            return
        if length <= 0 or length > MAX_SIZE * 2:
            self.send_json(413, {"ok": False, "error": "文件为空或过大"})
            return
        body = self.rfile.read(length)
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            self.send_json(400, {"ok": False, "error": "请求格式错误"})
            return
        if payload.get("password") != PASSWORD:
            self.send_json(403, {"ok": False, "error": "密码错误"})
            return
        filename = os.path.basename(str(payload.get("filename") or "").strip())
        data = payload.get("data") or ""
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
        path = os.path.join(UPLOAD_DIR, safe)
        try:
            with open(path, "wb") as f:
                f.write(raw)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "保存失败：" + str(e)})
            return
        self.send_json(200, {"ok": True, "path": "content/uploads/" + safe, "size": len(raw)})

    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    with ThreadingTCPServer(("127.0.0.1", port), Handler) as httpd:
        print("Rain的Aemeath知识库 · 本地服务器")
        print("访问地址: http://localhost:%d" % port)
        print("上传目录: content/uploads/")
        print("上传密码见本文件顶部的 PASSWORD")
        print("按 Ctrl+C 停止")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
