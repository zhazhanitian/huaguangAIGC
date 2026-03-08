# 可灵视频模型 kling-v2-6-image2video API使用文档（异步）

基于前沿的深度学习架构，可灵 AI 具备卓越的文生视频与图生视频能力。它突破了传统 AI 视频生成的瓶颈，能精准模拟物理世界的运动规律，确保画面动态流畅、主体高度一致。作为全球视频生成领域的第一梯队产品，可灵 AI 性能对标国际顶尖模型，且已全面开放使用，致力于为创作者提供触手可及的专业级视频创作体验。


# 🐰模型名称

kling-v2-6-image2video


# 🚗接口地址

视频生成需分两步：

提交视频生成任务
根据返回的 ID 查询结果
功能	端点
提交视频任务	https://www.dmxapi.cn/v1/responses
查询视频结果	https://www.dmxapi.cn/v1/responses


# ☀️部分可选参数

duration：视频时长（单位：秒），可选值：5 / 10


# ✈️生成视频 示例代码

```

"""
╔═══════════════════════════════════════════════════════════════╗
║                  模型调用示例                                  ║
╚═══════════════════════════════════════════════════════════════╝

📝 功能说明:
   通过 responses 接口进行对话交互（非流式输出）
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
api_key = "sk-************************************"


# ═══════════════════════════════════════════════════════════════
# 📋 步骤2: 配置请求头
# ═══════════════════════════════════════════════════════════════

headers = {
    "Content-Type": "application/json",      # 指定请求体为 JSON 格式
    "Authorization": f"{api_key}",           # token 认证方式
}


# ═══════════════════════════════════════════════════════════════
# 💬 步骤3: 配置请求参数
# ═══════════════════════════════════════════════════════════════

payload = {
    # 🤖 模型名称
    # - 固定值: "kling-v2-6-image2video"
    # - 说明: Kling V2.6 图生视频模型
    "model": "kling-v2-6-image2video",
             

    # 📝 提示词（必填）
    # - 类型: 字符串
    # - 说明: 描述视频中的动作、场景变化等
    # - 建议: 清晰描述想要的动作效果，避免过于复杂的描述
    # - 示例: "宇航员站起身走了"、"花瓣随风飘落"
    "input": "宇航员站起身哼着歌走了",

    # 🖼️ 首帧图片（必填）
    # - 类型: 图片URL（支持 http/https）
    # - 说明: 视频的起始画面，AI 将基于此图片生成动态视频
    # - 格式: 支持 JPG、PNG 等常见图片格式
    # - 建议: 使用高清图片以获得更好的生成效果
    "image": "https://h2.inkwai.com/bs2/upload-ylab-stunt/se/ai_portal_queue_mmu_image_upscale_aiweb/3214b798-e1b4-4b00-b7af-72b5b0417420_raw_image_0.jpg",

    # 🎬 尾帧图片（可选）
    # - 类型: 图片URL 或 空字符串
    # - 说明: 视频的结束画面，AI 将从首帧过渡到尾帧
    # - 用途: 精确控制视频的起止状态
    # - 留空: 由 AI 自动生成结束画面
    "image_tail": "",

    # 🚫 负向提示词（可选）
    # - 类型: 字符串
    # - 说明: 描述不希望出现的内容或效果
    # - 示例: "模糊、失真、变形、多余的肢体"
    # - 留空: 不使用负向提示
    "negative_prompt": "",

    # ⚙️ 生成模式（必填）
    # - 可选值: "pro" (高品质模式)
    # - 说明: pro 模式提供更高质量的视频生成效果
    # - 默认: "pro"
    "mode": "pro",

    # 🔊 音效开关（可选）
    # - 可选值: "on" (开启) / "off" (关闭)
    # - 说明: 是否为生成的视频添加 AI 配音
    # - 默认: "on"
    "sound": "on",

    # 🎤 语音列表（可选，需配合 sound="on" 使用）
    # - 类型: 数组，包含语音ID对象
    # - 说明: 指定特定的配音角色
    # - 示例: [{"voiceId": "genshin_vindi2"}]
    # - 留空: 使用默认配音
    # "voice_list": [
    #     {"voiceId": "genshin_vindi2"}
    # ],

    # 📐 宽高比（必填）
    # - 可选值:
    #   * "16:9" - 横屏视频（适合电脑、电视）
    #   * "9:16" - 竖屏视频（适合手机、短视频平台）
    #   * "1:1"  - 方形视频（适合社交媒体）
    # - 说明: 决定视频的画面比例
    "aspect_ratio": "16:9",

    # ⏱️ 视频时长（必填）
    # - 可选值: 5 或 10（单位：秒）
    # - 说明: 生成视频的持续时间
    # - 注意: 时长越长，生成时间越久，消耗资源越多
    "duration": 10,

    # 🔔 回调地址（可选）
    # - 类型: HTTP/HTTPS URL 或 空字符串
    # - 说明: 视频生成完成后，系统将向此地址发送 POST 请求通知
    # - 格式: 完整的 URL 地址（如 "https://your-domain.com/callback"）
    # - 留空: 不使用回调通知，需手动查询任务状态
    "callback_url": ""
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

# 🐯返回示例

```

{
  "code": 0,
  "message": "SUCCEED",
  "request_id": "8e8c4c70-d9bc-4a34-8cae-34edca295a1b",
  "data": {
    "task_id": "842081252995395657",
    "task_status": "submitted",
    "task_status_msg": "",
    "task_info": {},
    "created_at": 1768796217405,
    "updated_at": 1768796217405
  },
  "usage": {
    "total_tokens": 8500,
    "input_tokens": 0,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 8500,
    "output_tokens_details": {
      "reasoning_tokens": 0
    }
  }
}

```


# 🚀查询生成结果 示例代码

注意

视频生成需要一定时间，建议先在任务日志 https://www.dmxapi.cn/task 中确认完成后再下载。
您需要使用请求返回的 id 来获取视频文件。

```

"""
╔═══════════════════════════════════════════════════════════════╗
║                  Kling 任务查询示例                            ║
╚═══════════════════════════════════════════════════════════════╝

📝 功能说明:
   本脚本演示如何使用 kling-image2video-get 模型查询 Kling 视频生成任务状态
   通过 responses 接口进行流式查询

═══════════════════════════════════════════════════════════════
"""
import requests
import json
import sys
import time
import threading

# ═══════════════════════════════════════════════════════════════
# 🔑 步骤1: 配置 API 连接信息
# ═══════════════════════════════════════════════════════════════

# 🌐 DMXAPI 服务端点地址
url = "https://www.dmxapi.cn/v1/responses"

# 🔐 DMXAPI 密钥 (请替换为您自己的密钥)
# 获取方式: 登录 DMXAPI 官网 -> 个人中心 -> API 密钥管理
api_key = "sk-********************************************"

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
    "model": "kling-image2video-get",
    "input": "842081252995395657",
    "stream": True
}

# ═══════════════════════════════════════════════════════════════
# 📊 进度条类
# ═══════════════════════════════════════════════════════════════

class FakeProgressBar:
    """预估进度条"""

    def __init__(self):
        self.current_progress = 0
        self.running = False
        self.completed = False
        self.thread = None
        self.start_time = None

    def _render(self):
        """渲染进度条"""
        bar_length = 40
        filled = int(bar_length * self.current_progress / 100)
        bar = "█" * filled + "░" * (bar_length - filled)
        sys.stdout.write(f"\r⏳ 处理中: [{bar}] {self.current_progress:.1f}%")
        sys.stdout.flush()

    def _run(self):
    
        self.start_time = time.time()
        while self.running:
            elapsed = time.time() - self.start_time
            # 使用渐近函数：进度永远接近但不会到达99.9%
            # 前3分钟涨到约95%，之后越来越慢但一直在涨
            self.current_progress = 99.9 * (1 - 1 / (1 + elapsed / 60))
            self._render()
            time.sleep(0.1)

    def start(self):
        """启动进度条"""
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        self._render()

    def complete(self):
        """完成进度条"""
        self.running = False
        self.completed = True
        self.current_progress = 100
        self._render()
        print()  # 换行

    def stop(self):
        """停止进度条（不完成）"""
        self.running = False
        print()


# ═══════════════════════════════════════════════════════════════
# 📤 步骤4: 发送请求并输出结果
# ═══════════════════════════════════════════════════════════════

# 创建并启动进度条
progress = FakeProgressBar()
progress.start()

# 发送 POST 请求到 API 服务器（启用流式传输）
response = requests.post(url, headers=headers, json=payload, stream=True)

final_result = None

# 流式处理响应
# - 逐行读取 SSE 格式的数据
# - indent=2: 缩进 2 空格，便于阅读
# - ensure_ascii=False: 正确显示中文字符
for line in response.iter_lines():
    if line:
        line_text = line.decode('utf-8')
        # 处理 SSE 格式数据
        if line_text.startswith('data: '):
            data = line_text[6:]  # 去掉 "data: " 前缀
            if data != '[DONE]':
                try:
                    json_data = json.loads(data)
                    final_result = json_data
                except json.JSONDecodeError:
                    pass

# 完成进度条并输出结果
progress.complete()

print("\n" + "═" * 60)
print("✅ 查询完成！")
print("═" * 60 + "\n")

if final_result:
    # 尝试提取视频URL
    try:
        status = final_result.get("response", {}).get("status", "")
        output = final_result.get("response", {}).get("output", [])

        if status == "completed" and output:
            text_content = output[0].get("content", [{}])[0].get("text", "")

            # 提取任务ID
            if "任务ID:" in text_content:
                task_id = text_content.split("任务ID:")[1].split("\n")[0].strip()
                print(f"📋 任务ID: {task_id}")

            # 提取视频URL（查找 http 开头到 .mp4 结尾的部分，包括查询参数）
            import re
            url_match = re.search(r'(https?://[^\s]+\.mp4[^\s]*)', text_content)
            if url_match:
                video_url = url_match.group(1)
                # 清理URL末尾可能的杂字符
                video_url = re.sub(r'[\n\r].*$', '', video_url)
                print(f"\n🎬 视频链接:")
                print(video_url)

            # 提取时长
            duration_match = re.search(r'时长:\s*[\d.]+', text_content)
            if duration_match:
                print(f"\n⏱️  {duration_match.group(0)}秒")
        else:
            # 非完成状态，输出原始JSON
            print(json.dumps(final_result, indent=2, ensure_ascii=False))
    except Exception:
        # 解析失败，输出原始JSON
        print(json.dumps(final_result, indent=2, ensure_ascii=False))

```


# 🦁返回示例

```

 处理中: [████████████████████████████████████████] 100.0%

════════════════════════════════════════════════════════════
✅ 查询完成！
════════════════════════════════════════════════════════════

📋 任务ID: 842081252995395657

🎬 视频链接:
https://v1-fdl.kechuangai.com/ksc2/d-CsDyB6823hG3qnUACoYjdhG9G12sC6UkF_nLqvs-5yEZlkWjHqnV86RSJVHyuQiN3IaJnoT069AP9FnpvElKLzLwjvRkWjHWiz1s4301sJ8VtV3GIuMOJxZJUhrMh3bWl7bRplBZLiBfSDcKwztMeLWpZAhIixyQaraDSjZIvGv_aBIglY6BTWU4ac7qZocgCDzqyqbNK0aU1IUP2WcA.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAFdyihqqUfiX6Zr-A0_TrB7_hui6pr05V5yq3ms5aMIRxUQg46RiCjRb_SRpdkJ1zG3m54LHoyR4bQFAGDp2mc8o7U1WlTR_StXbc645euu4uYOu63ckqOyE28Q-it4omJhbEHR4MsuPHVjbFLjwBwPCXj5MlttzBVb40p0GVeEiU126T0UHUSmFrmxnKDwg2XABuMZXqzDHQOci4qyw-09Eu6d5dMuh3Y5jeHov5pO7RoSiK-SiyTQu2yvu8rTuMxr8vOaIiDlXNMCsCErNpkj2P4QxbCO4eAy1IP_-hsfqkD1pFwotSgFMAE&x-kcdn-pid=112757&pkey=AAXUWmCwX5Kl7Tzi2ZfHBHY2oi0lDDS1AZXj27tdj_v1Xr26_SiwjLX8UTRqiPyabZfSZP4n0MGnmnqxP3TK7pdbQEX4_4YycByz9xTkj3c0qGG8A-0P_RvvBpx3RVYl5EY

```