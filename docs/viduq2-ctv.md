Vidu视频模型 viduq2-ctv（viduq2） 参考生视频 API使用文档
作为国内首款实现商业落地的视频模型，viduq2一经推出，即获众多淘宝商家青睐。其卓越的视频生成能力，在真实感与流畅度上均表现出色，成为可靠的商用视频解决方案。

模型名称
viduq2-ctv

接口地址
调用 viduq2-ctv 官方接口需分两步：

提交视频生成任务
根据返回的 ID 查询结果
功能	端点
提交视频任务	https://www.dmxapi.cn/v1/responses
查询视频结果	https://www.dmxapi.cn/v1/responses
可选参数
resolution：视频分辨率，默认 720p，可选值：540p / 720p / 1080p
duration：视频时长（单位：秒）
默认值：5
可选值：1 - 10


创建多图参考生视频任务示例
import requests

import json


# ============================================================================

# 配置部分 - API 连接信息

# ============================================================================


# DMXAPI 的 URL 地址

url = "https://www.dmxapi.cn/v1/responses"


# API 密钥 - 用于身份验证和访问控制
# ⚠️ 请替换为您自己实际的API密钥
api_key = "sk-******************************"  


# ============================================================================

# 请求头配置 - 设置内容类型和授权信息

# ============================================================================

headers = {

    "Content-Type": "application/json",      # 指定请求体为 JSON 格式

    "Authorization": f"{api_key}",    # token 认证方式

}


# ============================================================================

# 请求参数配置 - AI 模型与输入内容

# ============================================================================

data = {

    # ---------- 基础配置 ----------

    

    "model": "viduq2-ctv",

    "subjects": [

        {

            "id": "1",

            "images": ["https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png", "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png"],

            "voice_id": ""

        },

        {

            "id": "2",

            "images": ["https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png"],

            "voice_id": ""

        },

    ],

    # ---------- prompt 文本提示词 ----------
    # 生成视频的文本描述
    # 注：字符长度不能超过 2000 个字符
    "input": "@1 中的两个小人在 @2 的场景中拥抱",

    # ---------- 视频时长配置 ----------
    # 默认值：5 秒，可选范围：1-10 秒
    "duration": 8,

    "audio": True,

    # ---------- 随机种子配置 ----------
    # 当默认不传或者传 0 时，会使用随机数替代
    # 手动设置则使用设置的种子
    "seed": 0,

    "aspect_ratio": "16:9",

    # ---------- 视频分辨率配置 ----------
    # 默认值：720p，可选值：540p、720p、1080p
    "resolution": "720p",

    "movement_amplitude": "auto",

    # ---------- 水印配置 ----------
    # 是否添加水印
    # - true：添加水印
    # - false：不添加水印
    # 注：目前水印内容为固定，内容由 AI 生成，默认不加
    "watermark": False,

    # ---------- 水印位置配置 ----------
    # 表示水印出现在图片的位置，可选项为：
    # 1：左上角
    # 2：右上角
    # 3：右下角
    # 4：左下角
    "wm_position": 3,

    # ---------- 水印内容配置 ----------
    # 水印内容，此处为图片 URL
    # 不传时，使用默认水印：内容由 AI 生成
    "wm_url": "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png",

    # ---------- 回调地址配置 ----------
    # Callback 协议：请求方法为 POST
    # 当视频生成任务有状态变化时，Vidu 将向此地址发送包含任务最新状态的回调请求
    # 回调请求内容结构与查询任务 API 的返回体一致
    # 回调返回的 status 包括以下状态：
    # - processing：任务处理中
    # - success：任务完成（如发送失败，回调三次）
    # - failed：任务失败（如发送失败，回调三次）
    "callback_url": "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn"




}

# ============================================================================

# 发送请求并处理非流式响应

# ============================================================================


# 发送 POST 请求到 API 服务器

response = requests.post(url, headers=headers, json=data)


# ----------------------------------------------------------------------------

# 处理非流式响应 - 格式化打印原始 JSON 数据

# ----------------------------------------------------------------------------

try:

    # 获取响应的 JSON 数据

    response_data = response.json()


    # 格式化打印原始 JSON 响应

    # indent=2: 使用2个空格缩进

    # ensure_ascii=False: 保留中文字符不转义

    print(json.dumps(response_data, indent=2, ensure_ascii=False))


# ----------------------------------------------------------------------------

# 异常处理

# ----------------------------------------------------------------------------

except KeyboardInterrupt:

    # 处理用户中断 - 当用户按 Ctrl+C 时优雅退出

    print("\n\n⚠️ 用户中断了请求")


except json.JSONDecodeError as e:

    # 处理 JSON 解析错误

    print(f"❌ JSON 解析错误: {e}")

    print(f"原始响应内容: {response.text}")


except Exception as e:

    # 处理其他异常 - 捕获并显示任何意外错误

    print(f"❌ 发生错误: {e}")


返回示例
{
  "task_id": "903875784081420288",
  "type": "character2video",
  "state": "created",
  "model": "viduq2",
  "style": "general",
  "prompt": "@2 中的两个小人在 @1 的场景中拥抱",
  "images": [
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png",
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png",
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png"
  ],
  "duration": 8,
  "seed": 1070246527,
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "movement_amplitude": "auto",
  "created_at": 1767172295,
  "credits": 75,
  "payload": "",
  "cus_priority": 0,
  "off_peak": false,
  "watermark": false,
  "is_rec": false,
  "wm_position": "bottom_right",
  "wm_url": "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png",
  "meta_data": "",
  "client_request_id": "",
  "usage": {
    "total_tokens": 234375,
    "input_tokens": 0,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 234375,
    "output_tokens_details": {
      "reasoning_tokens": 0
    }
  }
}




