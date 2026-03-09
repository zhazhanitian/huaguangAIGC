# 海螺 Hailuo 图生视频 API 接口文档

## 概述
海螺 AI 提供强大的图片生成视频能力，支持多种模型和丰富的运镜控制功能。本文档详细介绍如何通过 API 调用海螺视频生成服务。

## 接口地址
功能	接口端点	请求方式
提交任务	https://www.dmxapi.cn/v1/video_generation	POST
查询任务	https://www.dmxapi.cn/v1/query/video_generation	GET
下载视频	https://www.dmxapi.cn/v1/files/retrieve	GET

## 可用模型
海螺提供三种视频生成模型，各有特点：
MiniMax-Hailuo-2.3 - 标准版本，平衡质量与速度


# 一、提交视频生成任务
## 1.1 请求示例
使用以下代码提交视频生成任务：
```
import requests
import json

url = "https://www.dmxapi.cn/v1/video_generation"

headers = {
    "Authorization": "sk-*******************************************",
    "Content-Type": "application/json"
}

data = {
    # ==================== 模型配置 ====================
    "model": "MiniMax-Hailuo-2.3",  # 模型名称

    # ==================== 内容设置 ====================
    "prompt": "A mouse runs toward the camera, smiling and blinking.",
    # 视频的文本描述，最大 2000 字符
    # 支持使用 [指令] 语法进行运镜控制（适用于 2.3/2.3-Fast/02 模型）
    #
    # 支持 15 种运镜指令:
    #   - 左右移: [左移], [右移]
    #   - 左右摇: [左摇], [右摇]
    #   - 推拉:   [推进], [拉远]
    #   - 升降:   [上升], [下降]
    #   - 上下摇: [上摇], [下摇]
    #   - 变焦:   [变焦推近], [变焦拉远]
    #   - 其他:   [晃动], [跟随], [固定]
    #
    # 使用规则:
    #   - 组合运镜: 同一 [] 内多个指令同时生效，如 [左摇,上升]，建议不超过 3 个
    #   - 顺序运镜: 前后出现的指令依次生效，如 "...[推进], 然后...[拉远]"
    #   - 也支持自然语言描述运镜，但标准指令更准确

    # ==================== 首帧图片 ====================
    "first_frame_image": "https://cdn.hailuoai.com/prod/2024-09-18-16/user/multi_chat_file/9c0b5c14-ee88-4a5b-b503-4f626f018639.jpeg",
    # 指定图片作为视频起始帧，支持公网 URL 或 Base64 编码
    #
    # 图片要求:
    #   - 格式: JPG, JPEG, PNG, WebP
    #   - 体积: < 20MB
    #   - 尺寸: 短边 > 300px，长宽比在 2:5 ~ 5:2 之间

    # ==================== 视频参数 ====================
    "duration": 6,
    # 视频时长（秒），默认 6
    #
    # 时长与模型/分辨率对应关系:
    # ┌─────────────────────────┬─────────┬───────┐
    # │ Model                   │  768P   │ 1080P │
    # ├─────────────────────────┼─────────┼───────┤
    # │ MiniMax-Hailuo-2.3      │ 6 or 10 │   6   │
    # │ MiniMax-Hailuo-2.3-Fast │ 6 or 10 │   6   │
    # │ MiniMax-Hailuo-02       │ 6 or 10 │   6   │
    # └─────────────────────────┴─────────┴───────┘

    "resolution": "768P",
    # 视频分辨率
    #
    # 分辨率与模型对应关系:
    # ┌─────────────────────────┬────────────────────────────┬────────────────┐
    # │ Model                   │         6s                 │      10s       │
    # ├─────────────────────────┼────────────────────────────┼────────────────┤
    # │ MiniMax-Hailuo-2.3      │ 768P (Default), 1080P      │ 768P (Default) │
    # │ MiniMax-Hailuo-2.3-Fast │ 768P (Default), 1080P      │ 768P (Default) │
    # │ MiniMax-Hailuo-02       │ 512P, 768P (Default), 1080P│ 512P, 768P     │
    # └─────────────────────────┴────────────────────────────┴────────────────┘
    # 可用选项: 512P, 720P, 768P, 1080P

    # ==================== 可选参数 ====================
    # "prompt_optimizer": True,    # 是否自动优化 prompt，默认 True
    # "fast_pretreatment": False,  # 是否缩短优化耗时，默认 False（仅 2.3/2.3-Fast/02）
    # "aigc_watermark": False,     # 是否添加水印，默认 False
}

response = requests.post(url, headers=headers, json=data)

print(f"Status Code: {response.status_code}")
print("\nResponse:")
print(json.dumps(response.json(), indent=2, ensure_ascii=False))
```

## 1.2 响应示例
成功提交任务后，您将收到包含 task_id 的响应：
```
Status Code: 200

Response:
{
  "task_id": "335794020467133",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

## 二、查询任务状态
2.1 请求示例
使用任务 ID 查询视频生成状态：
```
# ================================
# 视频生成任务查询脚本
# ================================

import requests
import json

# ================================
# 1. 配置 DMXAPI 信息
# ================================

# DMXAPI 基础地址
base_url = "https://www.dmxapi.cn"

# DMXAPI 端点：查询视频生成状态
endpoint = "/v1/query/video_generation"

# 视频生成任务 ID
task_id = "335794020467133"

# ================================
# 2. 认证信息
# ================================

# DMMXAPI 授权令牌（Token）
token = "sk-*******************************************"

# ================================
# 3. 构建 HTTP 请求
# ================================

# 完整的请求 URL
url = f"{base_url}{endpoint}?task_id={task_id}"

# 请求头，包含认证信息
headers = {
    "Authorization": f"{token}"
}

# ================================
# 4. 发送 API 请求
# ================================

response = requests.get(url, headers=headers)

# ================================
# 5. 处理和显示响应
# ================================

# 显示 HTTP 状态码
print(f"Status Code: {response.status_code}")

# 显示完整的 JSON 响应（格式化输出）
print("Response:")
print(json.dumps(response.json(), indent=2, ensure_ascii=False))
```

2.2 响应示例
任务完成后，响应将包含 file_id 和视频尺寸信息：
```
Response:
{
  "status": "Success",
  "file_id": "335797537439947",
  "task_id": "335794020467133",
  "base_resp": {
    "status_msg": "success",
    "status_code": 0
  },
  "video_width": 1362,
  "video_height": 768
}
```

## 三、下载生成的视频
3.1 请求示例
使用 file_id 获取视频下载链接：
```
import requests
import json

# ======================== API 配置 ========================
# DMXAPI 基础 URL
BASE_URL = "https://www.dmxapi.cn"  # 替换为实际的 API 域名

# 文件 ID - 用于标识要检索的文件
FILE_ID = "335797537439947"

# 任务 ID - 用于标识相关的任务
TASK_ID = "335794020467133"

# 认证令牌 - 用于 DMXAPI 请求的身份验证
TOKEN = "sk-*******************************************"

# ======================== 构建 API 请求 ========================
# 文件检索端点 URL
url = f"{BASE_URL}/v1/files/retrieve"

# 请求参数：包含文件 ID 和任务 ID
params = {
    "file_id": FILE_ID,      # 指定要检索的文件
    "task_id": TASK_ID       # 指定相关的任务
}

# 请求头：包含认证信息
headers = {
    "Authorization": f"{TOKEN}"  # 令牌认证
}

# ======================== 发送 API 请求 ========================
# 发送 GET 请求到 API 端点
response = requests.get(url, params=params, headers=headers)

# ======================== 输出响应结果 ========================
# 输出 HTTP 状态码
print(f"Status Code: {response.status_code}")

# 输出格式化的 JSON 响应内容
print(f"Response:\n{json.dumps(response.json(), indent=2, ensure_ascii=False)}")
```

3.2 响应示例
成功响应将包含可直接访问的视频下载链接：
```
Status Code: 200
Response:
{
  "file": {
    "file_id": 335797537439947,
    "bytes": 0,
    "created_at": 1763534921,
    "filename": "output_aigc.mp4",
    "purpose": "video_generation",
    "download_url": "https://public-cdn-video-data-algeng.oss-cn-wulanchabu.aliyuncs.com/inference_output%2Fvideo%2F2025-11-19%2F67c3228e-ef10-4727-b48b-a2c7fe61c9ba%2Foutput_aigc.mp4?Expires=1763567386&OSSAccessKeyId=LTAI5tAmwsjSaaZVA6cEFAUu&Signature=4VYDRjpAKDmDGq3UQSJ%2F066ENDQ%3D"
  },
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

# 常见问题
任务状态说明
查询任务时，status 字段可能的值包括：
Processing - 任务正在处理中
Success - 任务已完成
Failed - 任务失败

