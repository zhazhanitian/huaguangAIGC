# 豆包 doubao-seedance-1-5-pro-responses 文生视频 API使用文档
doubao-seedance-1-5-pro-responses是一款原生支持音频与视频联合生成的专业级视频生成模型，面向“音画同步”的创作需求。模型采用双分支 Diffusion Transformer 架构，通过跨模态联合模块统一建模画面、语音与节奏，使生成的视频在口型、情绪与声音节奏上保持高度一致。

# ✈️模型名称
doubao-seedance-1-5-pro-responses

# 🚀接口地址
调用 doubao-seedance-1-5-pro-responses 官方接口需分两步：

提交视频生成任务
根据返回的 ID 查询结果
功能	端点
提交视频任务	https://www.dmxapi.cn/v1/responses
查询视频结果	https://www.dmxapi.cn/v1/responses

# 📚可选参数
resolution：视频分辨率，可选值：480p / 720p / 1080p
duration：视频时长（单位：秒）
默认值：5
可选值：4 - 12

# 🐻文生视频 示例代码
```
"""
╔═══════════════════════════════════════════════════════════════╗
║                  DMXAPI 自研接口                               ║
╚═══════════════════════════════════════════════════════════════╝

📝 功能说明:
   本脚本演示如何使用 requests 库调用 DMXAPI 的自研接口

═══════════════════════════════════════════════════════════════
"""

import requests
import json

# ═══════════════════════════════════════════════════════════════
# 🔑 步骤1: 配置 API 连接信息
# ═══════════════════════════════════════════════════════════════

# 🌐 DMXAPI 服务端点地址
url = "https://www.dmxapi.cn/v1/responses"

# 🔐 DMXAPI 密钥 (请替换为您自己的密钥)
# 获取方式: 登录 DMXAPI 官网 -> 个人中心 -> API 密钥管理
api_key = "sk-***********************************************"

# ═══════════════════════════════════════════════════════════════
# 📋 步骤2: 配置请求头
# ═══════════════════════════════════════════════════════════════

headers = {
    "Content-Type": "application/json",      # 指定请求体为 JSON 格式
    "Authorization": f"{api_key}",    # token 认证方式
}

# ═══════════════════════════════════════════════════════════════
# 💬 步骤3: 配置请求参数
# ═══════════════════════════════════════════════════════════════

payload = {
    # ─────────────────────────────────────────────────────────────
    # 🤖 模型名称
    # ─────────────────────────────────────────────────────────────
    "model": "doubao-seedance-1-5-pro-responses",

    # ─────────────────────────────────────────────────────────────
    # 📝 输入内容 (文本提示词 + 可选的首帧/尾帧图片)
    # ─────────────────────────────────────────────────────────────
    "input": [
        {
            "type": "text",                                        # 输入类型: 文本
            "text": "图中女孩对着镜头说'茄子'，360度环绕运镜"       # 视频生成提示词
        },

    ],

    # ─────────────────────────────────────────────────────────────
    # ⚙️ 视频生成参数
    # ─────────────────────────────────────────────────────────────
    "callback_url": "",            # 回调地址 (生成完成后通知的URL，可留空)
    "return_last_frame": False,    # 是否返回最后一帧图片
    "generate_audio": True,        # 是否生成音频
    "resolution": "1080p",         # 视频分辨率: 480p / 720p / 1080p 
    "ratio": "16:9",               # 宽高比: 16:9 / 4:3 / 1:1 / 3:4 / 9:16 / 21:9 / adaptive 
    "duration": 5,                 # 视频时长: 4-12秒整数，-1为模型自动选择 (时长影响计费)
    "seed": -1,                    # 随机种子: -1为随机，固定值可复现结果
    "camera_fixed": False,         # 是否固定镜头 (不移动)
    "watermark": False             # 是否添加水印
}

# ═══════════════════════════════════════════════════════════════
# 📤 步骤4: 发送请求并输出结果
# ═══════════════════════════════════════════════════════════════

# 发送 POST 请求到 API 服务器
response = requests.post(url, headers=headers, json=payload)

# 格式化输出 JSON 响应
# - indent=2: 缩进 2 空格，便于阅读
# - ensure_ascii=False: 正确显示中文字符
print(json.dumps(response.json(), indent=2, ensure_ascii=False))
```

# 🧙‍♀️返回示例
```
{
  "id": "cgt-20260119220813-h5v84",
  "usage": {
    "total_tokens": 3910,
    "input_tokens": 0,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 3910,
    "output_tokens_details": {
      "reasoning_tokens": 0
    }
  }
}
```

# 🐯视频生成查询 示例代码
```
"""
╔═══════════════════════════════════════════════════════════════╗
║                  DMXAPI 自研接口                               ║
╚═══════════════════════════════════════════════════════════════╝

📝 功能说明:
   本脚本演示如何使用 requests 库调用 DMXAPI 的自研接口
   获取视频生成进度并显示进度条

═══════════════════════════════════════════════════════════════
"""

import requests
import json
import sys
import re

# ═══════════════════════════════════════════════════════════════
# 🔑 步骤1: 配置 API 连接信息
# ═══════════════════════════════════════════════════════════════

# 🌐 DMXAPI 服务端点地址
url = "https://www.dmxapi.cn/v1/responses"

# 🔐 DMXAPI 密钥 (请替换为您自己的密钥)
# 获取方式: 登录 DMXAPI 官网 -> 个人中心 -> API 密钥管理
api_key = "sk-**********************************************"

# ═══════════════════════════════════════════════════════════════
# 📋 步骤2: 配置请求头
# ═══════════════════════════════════════════════════════════════

headers = {
    "Content-Type": "application/json",      # 指定请求体为 JSON 格式
    "Authorization": f"{api_key}",    # token 认证方式
}

# ═══════════════════════════════════════════════════════════════
# 💬 步骤3: 配置请求参数
# ═══════════════════════════════════════════════════════════════

payload = {
    "model": "seedance-get",
    "input": "cgt-20260119220813-h5v84",
    "stream": True # 只支持流式输出，请勿修改
}

# ═══════════════════════════════════════════════════════════════
# 📤 步骤4: 发送请求并显示进度条
# ═══════════════════════════════════════════════════════════════

response = requests.post(url, headers=headers, json=payload, stream=True)

progress = 0
video_url = None
step_count = 0

# 后40%进度映射：根据实际事件类型设置进度
progress_map = {
    "response.output_text.delta": 70,
    "response.output_text.done": 80,
    "response.content_part.done": 85,
    "response.output_item.done": 90,
    "response.completed": 100
}

def show_progress(p):
    """显示进度条"""
    bar = '█' * (p // 2) + '░' * (50 - p // 2)
    sys.stdout.write(f'\r[{bar}] {p}%')
    sys.stdout.flush()

for line in response.iter_lines():
    if line:
        line_str = line.decode('utf-8')

        # 跳过 event: 行
        if line_str.startswith('event:'):
            continue

        # 处理 data: 行
        if line_str.startswith('data: '):
            line_str = line_str[6:]

        if line_str == '[DONE]':
            progress = 100
            show_progress(progress)
            break

        try:
            data = json.loads(line_str)
            event_type = data.get('type', '')

            # 前60%：稳步增长
            if progress < 60:
                step_count += 1
                progress = min(step_count * 10, 60)

            # 后40%：根据实际事件类型更新
            if event_type in progress_map:
                progress = max(progress, progress_map[event_type])

            # 提取视频URL（从文本内容中）
            if event_type == 'response.completed':
                progress = 100
                text_content = data.get('response', {}).get('output', [{}])[0].get('content', [{}])[0].get('text', '')
                url_match = re.search(r'视频URL: (https://[^\s\n]+)', text_content)
                if url_match:
                    video_url = url_match.group(1)

            show_progress(progress)

        except json.JSONDecodeError:
            pass

# 完成后换行并输出视频URL
print()
if video_url:
    print(f"视频地址: {video_url}")
else:
    print("未获取到视频地址")
```

# 🎈返回示例

```
[██████████████████████████████████████████████████] 100%
视频地址: https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-1-5-pro/示例视频地址.mp4
```