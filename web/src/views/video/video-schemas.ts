export type VideoInputMode = 'text' | 'frame' | 'ref' | 'motion'

export type VideoFieldGroup = 'basic' | 'advanced'

type FieldMeta = {
  group?: VideoFieldGroup
  help?: string
  visibleWhen?: (v: Record<string, unknown>) => boolean
}

export type VideoField =
  | ({
      key: string
      label: string
      type: 'radio-button'
      options: Array<{ value: string | number | boolean; label: string }>
      default?: string | number | boolean
    } & FieldMeta)
  | ({
      key: string
      label: string
      type: 'select'
      options: Array<{ value: string | number | boolean; label: string }>
      default?: string | number | boolean
    } & FieldMeta)
  | ({
      key: string
      label: string
      type: 'switch'
      default?: boolean
      onText?: string
      offText?: string
    } & FieldMeta)
  | ({
      key: string
      label: string
      type: 'input-number'
      min?: number
      max?: number
      step?: number
      default?: number | null
      placeholder?: string
    } & FieldMeta)

export interface VideoSchema {
  model: string
  displayName: string
  summary: string
  hint: string
  inputModes: VideoInputMode[]
  maxRefImages: number
  durations: number[]
  previewDurations?: number[]
  supportsPreview: boolean
  supportsPreviewResolution: boolean
  fields: VideoField[]
}

type VideoTaskLike = {
  provider?: string
  status?: string
  errorMessage?: string | null
  params?: Record<string, unknown> | null
}

const ratioFields = (
  options: Array<{ value: string; label: string }>,
  defaultValue: string,
  group: VideoFieldGroup = 'basic',
): VideoField => ({
  key: 'aspectRatio',
  label: '画面比例',
  type: 'radio-button',
  options,
  default: defaultValue,
  group,
})

const durationField = (
  values: number[],
  key = 'duration',
  group: VideoFieldGroup = 'basic',
): VideoField => ({
  key,
  label: '视频时长',
  type: 'radio-button',
  options: values.map((v) => ({ value: v, label: `${v}秒` })),
  default: values[0],
  group,
})

const schemaMap: Record<string, VideoSchema> = {
  'veo3.1-fast': {
    model: 'veo3.1-fast',
    displayName: 'Veo 3.1 Fast',
    summary: '快速生成，适合高频试错与首尾帧/参考图驱动。',
    hint: '支持首尾帧 + 参考图（最多 3 张），适合快速试错。',
    inputModes: ['text', 'frame', 'ref'],
    maxRefImages: 3,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      ratioFields(
        [
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
        ],
        '16:9',
      ),
      durationField([5, 10]),
    ],
  },
  'veo3.1-pro': {
    model: 'veo3.1-pro',
    displayName: 'Veo 3.1 Pro',
    summary: '高质量生成，适合更稳定的成片输出。',
    hint: '支持首尾帧，高质量生成。',
    inputModes: ['text', 'frame'],
    maxRefImages: 0,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      ratioFields(
        [
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
        ],
        '16:9',
      ),
      durationField([5, 10]),
    ],
  },
  'sora-2': {
    model: 'sora-2',
    displayName: 'Sora 2',
    summary: '文本或参考图生成视频，适合叙事型内容。',
    hint: '支持文本/参考图，预览模式支持 4/8/12 秒。',
    inputModes: ['text', 'ref'],
    maxRefImages: 1,
    durations: [10, 15],
    previewDurations: [4, 8, 12],
    supportsPreview: true,
    supportsPreviewResolution: false,
    fields: [
      ratioFields(
        [
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
        ],
        '16:9',
      ),
      durationField([10, 15]),
      {
        key: 'previewMode',
        label: '预览模式',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
    ],
  },
  'sora-2-pro': {
    model: 'sora-2-pro',
    displayName: 'Sora 2 Pro',
    summary: '更长时长、更高质量，适合高规格内容。',
    hint: '支持更长时长，预览模式支持高分辨率。',
    inputModes: ['text', 'ref'],
    maxRefImages: 1,
    durations: [10, 15, 25],
    previewDurations: [4, 8, 12],
    supportsPreview: true,
    supportsPreviewResolution: true,
    fields: [
      ratioFields(
        [
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
        ],
        '16:9',
      ),
      durationField([10, 15, 25]),
      {
        key: 'previewMode',
        label: '预览模式',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'previewResolution',
        label: '预览分辨率',
        type: 'select',
        options: [
          { value: 'standard', label: '标准' },
          { value: 'high', label: '高' },
        ],
        default: 'standard',
        group: 'advanced',
        visibleWhen: (v) => v.previewMode === true,
      },
    ],
  },
  'kling-3.0': {
    model: 'kling-3.0',
    displayName: 'Kling 3.0',
    summary: '支持首尾帧、方形比例和音效，适合短视频创意。',
    hint: '支持首尾帧 / 方形比例 / 音效，适合短视频创意。',
    inputModes: ['text', 'frame'],
    maxRefImages: 0,
    durations: [5, 8, 10, 15],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      ratioFields(
        [
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
          { value: '1:1', label: '1:1 方形' },
        ],
        '16:9',
      ),
      durationField([5, 8, 10, 15]),
      {
        key: 'klingMode',
        label: '画质模式',
        type: 'radio-button',
        options: [
          { value: 'std', label: '标准' },
          { value: 'pro', label: '高清' },
        ],
        default: 'pro',
      },
      {
        key: 'sound',
        label: '音效',
        type: 'switch',
        default: false,
      },
    ],
  },
  'kling-2/text-to-video': {
    model: 'kling-2/text-to-video',
    displayName: 'Kling 2 文生视频',
    summary: '文生视频，支持比例和音效。',
    hint: '文生视频，支持多比例与音效。',
    inputModes: ['text'],
    maxRefImages: 0,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      ratioFields(
        [
          { value: '1:1', label: '1:1 方形' },
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
          { value: '4:3', label: '4:3 标准' },
        ],
        '16:9',
      ),
      durationField([5, 10]),
      {
        key: 'sound',
        label: '生成音效',
        type: 'switch',
        default: false,
      },
    ],
  },
  'kling-2/image-to-video': {
    model: 'kling-2/image-to-video',
    displayName: 'Kling 2 图生视频',
    summary: '图生视频，支持首尾画面驱动。',
    hint: '图生视频，1 张参考图驱动。',
    inputModes: ['ref'],
    maxRefImages: 1,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      ratioFields(
        [
          { value: '1:1', label: '1:1 方形' },
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
          { value: '4:3', label: '4:3 标准' },
        ],
        '16:9',
      ),
      durationField([5, 10]),
      {
        key: 'sound',
        label: '生成音效',
        type: 'switch',
        default: false,
      },
    ],
  },
  'kling-2/motion-control': {
    model: 'kling-2/motion-control',
    displayName: 'Kling 2 动作控制',
    summary: '角色图 + 动作视频，适合定向动作生成。',
    hint: '角色图 + 动作视频，适合定向动作生成。',
    inputModes: ['motion'],
    maxRefImages: 0,
    durations: [5],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      {
        key: 'motionResolution',
        label: '输出分辨率',
        type: 'radio-button',
        options: [
          { value: '480p', label: '480p' },
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
        ],
        default: '720p',
      },
      {
        key: 'character_orientation',
        label: '角色朝向',
        type: 'radio-button',
        options: [
          { value: 'image', label: 'image' },
          { value: 'video', label: 'video' },
          { value: 'auto', label: 'auto' },
        ],
        default: 'image',
      },
    ],
  },
  'bytedance/seedance-1-pro': {
    model: 'bytedance/seedance-1-pro',
    displayName: 'Seedance 1 Pro',
    summary: '支持文本、参考图和首尾帧，适合中短视频生成。',
    hint: '支持文本 / 参考图 / 首尾帧。',
    inputModes: ['text', 'frame', 'ref'],
    maxRefImages: 2,
    durations: [4, 6, 8, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      ratioFields(
        [
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
          { value: '1:1', label: '1:1 方形' },
        ],
        '16:9',
      ),
      durationField([4, 6, 8, 10]),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'radio-button',
        options: [
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
        ],
        default: '720p',
      },
      {
        key: 'generate_audio',
        label: '生成音频',
        type: 'switch',
        default: false,
      },
      {
        key: 'fixed_lens',
        label: '固定镜头',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
    ],
  },
  'viduq2-ctv': {
    model: 'viduq2-ctv',
    displayName: 'Vidu Q2 CTV',
    summary: '多图参考生视频，适合短时长视觉演示。',
    hint: '多图参考生视频，需至少 1 张参考图。',
    inputModes: ['ref'],
    maxRefImages: 10,
    durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      durationField([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'radio-button',
        options: [
          { value: '540p', label: '540p' },
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
        ],
        default: '720p',
      },
      {
        key: 'audio',
        label: '生成音频',
        type: 'switch',
        default: false,
      },
      {
        key: 'watermark',
        label: '添加水印',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'seed',
        label: '随机种子',
        type: 'input-number',
        min: 0,
        step: 1,
        default: 0,
        group: 'advanced',
      },
    ],
  },
  'viduq2-pro': {
    model: 'viduq2-pro',
    displayName: 'Vidu Q2 Pro',
    summary: '首尾帧视频生成，适合镜头过渡和动态变化。',
    hint: '需首帧 + 尾帧两张图，适合镜头过渡。',
    inputModes: ['frame'],
    maxRefImages: 0,
    durations: [1, 2, 3, 4, 5, 6, 7, 8],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      durationField([1, 2, 3, 4, 5, 6, 7, 8]),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'radio-button',
        options: [
          { value: '540p', label: '540p' },
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
        ],
        default: '720p',
      },
      {
        key: 'movement_amplitude',
        label: '运动幅度',
        type: 'select',
        options: [
          { value: 'auto', label: 'auto' },
          { value: 'small', label: 'small' },
          { value: 'medium', label: 'medium' },
          { value: 'large', label: 'large' },
        ],
        default: 'auto',
      },
      {
        key: 'bgm',
        label: 'BGM',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'watermark',
        label: '添加水印',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'wm_position',
        label: '水印位置',
        type: 'select',
        options: [
          { value: 1, label: '左上' },
          { value: 2, label: '右上' },
          { value: 3, label: '左下' },
          { value: 4, label: '右下' },
        ],
        default: 3,
        group: 'advanced',
      },
      {
        key: 'seed',
        label: '随机种子',
        type: 'input-number',
        min: 0,
        step: 1,
        default: 0,
        group: 'advanced',
      },
    ],
  },
  'kling-v2-6-text2video': {
    model: 'kling-v2-6-text2video',
    displayName: 'Kling v2.6 文生视频',
    summary: 'DMX 文生视频，适合高质量中文描述生成。',
    hint: 'DMX 文生视频，支持音效和多比例。',
    inputModes: ['text'],
    maxRefImages: 0,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      ratioFields(
        [
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
          { value: '1:1', label: '1:1 方形' },
        ],
        '16:9',
      ),
      durationField([5, 10]),
      {
        key: 'sound',
        label: '音效',
        type: 'select',
        options: [
          { value: 'off', label: '关闭' },
          { value: 'on', label: '开启' },
        ],
        default: 'off',
      },
      {
        key: 'negative_prompt',
        label: '负向提示词',
        type: 'select',
        options: [],
        group: 'advanced',
      } as VideoField,
    ],
  },
  'kling-v2-6-image2video': {
    model: 'kling-v2-6-image2video',
    displayName: 'Kling v2.6 图生视频',
    summary: 'DMX 图生视频，支持首帧与可选尾帧配合。',
    hint: '上传 1 张首帧图，可选尾帧图。',
    inputModes: ['ref'],
    maxRefImages: 1,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      ratioFields(
        [
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
          { value: '1:1', label: '1:1 方形' },
        ],
        '16:9',
      ),
      durationField([5, 10]),
      {
        key: 'sound',
        label: '音效',
        type: 'select',
        options: [
          { value: 'off', label: '关闭' },
          { value: 'on', label: '开启' },
        ],
        default: 'off',
      },
      {
        key: 'negative_prompt',
        label: '负向提示词',
        type: 'select',
        options: [],
        group: 'advanced',
      } as VideoField,
    ],
  },
  'hailuo-2.3': {
    model: 'hailuo-2.3',
    displayName: 'MiniMax Hailuo 2.3',
    summary: '支持文生和单图图生，适合镜头感较强的视频。',
    hint: '支持文生与单图图生，6 / 10 秒。',
    inputModes: ['text', 'ref'],
    maxRefImages: 1,
    durations: [6, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      durationField([6, 10]),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'radio-button',
        options: [
          { value: '768P', label: '768P' },
          { value: '1080P', label: '1080P' },
        ],
        default: '768P',
      },
      {
        key: 'prompt_optimizer',
        label: 'Prompt 优化',
        type: 'switch',
        default: true,
        group: 'advanced',
      },
      {
        key: 'fast_pretreatment',
        label: '快速预处理',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'aigc_watermark',
        label: 'AIGC 水印',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
    ],
  },
  'doubao-seedance-text': {
    model: 'doubao-seedance-text',
    displayName: 'Doubao Seedance 文生视频',
    summary: '4-15 秒文生视频，支持 6 种画面比例与三档分辨率。',
    hint: '支持生成音频 / 固定镜头 / 水印 / 随机种子；时长 4-15 秒，比例支持 21:9、16:9、4:3、1:1、3:4、9:16。',
    inputModes: ['text'],
    maxRefImages: 0,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      durationField([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'radio-button',
        options: [
          { value: '480p', label: '480p' },
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
        ],
        default: '720p',
      },
      {
        key: 'ratio',
        label: '画面比例',
        type: 'radio-button',
        options: [
          { value: '21:9', label: '21:9 超宽' },
          { value: '16:9', label: '16:9 横屏' },
          { value: '4:3', label: '4:3 标准' },
          { value: '1:1', label: '1:1 方形' },
          { value: '3:4', label: '3:4 竖版' },
          { value: '9:16', label: '9:16 竖屏' },
        ],
        default: '16:9',
      },
      {
        key: 'generate_audio',
        label: '生成音频',
        type: 'switch',
        default: true,
      },
      {
        key: 'camera_fixed',
        label: '固定镜头',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'watermark',
        label: '水印',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'seed',
        label: '随机种子',
        type: 'input-number',
        min: -1,
        step: 1,
        default: -1,
        group: 'advanced',
      },
    ],
  },
  /**
   * Doubao Seedance 2.0 / 2.0 Fast — 文生 + 图生统一 schema
   * 支持三种模式（文档：https://mapi.planisp.com/docs?menu=doubao-seedance-2-0）：
   *   text   → text_to_video：纯文字驱动，时长 4-15 秒，比例 6 选项
   *   frame  → first_last_frames：首帧（必填）+ 尾帧（可选），比例由首帧图片自动决定
   *   ref    → omni_reference：参考图驱动，时长 4-15 秒，比例 6 选项
   */
  'doubao-seedance-2-0': {
    model: 'doubao-seedance-2-0',
    displayName: 'Seedance 2.0',
    summary: '4-15 秒文生/图生视频，支持首尾帧、多模态参考图（omni_reference）三种模式。',
    hint: '文字直接生成；首尾帧模式上传首帧（必填）+尾帧（可选），比例由图片自动决定；参考图（omni_reference）模式最多上传 12 张图片，做内容/风格引导。',
    inputModes: ['text', 'frame', 'ref'],
    maxRefImages: 12,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      durationField([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'radio-button',
        options: [
          { value: '480p', label: '480p' },
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
        ],
        default: '720p',
      },
      {
        key: 'ratio',
        label: '画面比例',
        type: 'radio-button',
        options: [
          { value: '21:9', label: '21:9 超宽' },
          { value: '16:9', label: '16:9 横屏' },
          { value: '4:3', label: '4:3 标准' },
          { value: '1:1', label: '1:1 方形' },
          { value: '3:4', label: '3:4 竖版' },
          { value: '9:16', label: '9:16 竖屏' },
          { value: 'adaptive', label: '自适应' },
        ],
        default: '16:9',
        help: '首尾帧模式下比例由输入图片自动决定，可选"自适应"',
      },
      {
        key: 'generate_audio',
        label: '生成音频',
        type: 'switch',
        default: true,
      },
      {
        key: 'camera_fixed',
        label: '固定镜头',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'watermark',
        label: '水印',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'seed',
        label: '随机种子',
        type: 'input-number',
        min: -1,
        step: 1,
        default: -1,
        group: 'advanced',
        help: '-1 表示随机，相同 seed + 相同输入可复现结果',
      },
    ],
  },

  'doubao-seedance-image': {
    model: 'doubao-seedance-image',
    displayName: 'Doubao Seedance 图生视频',
    summary: '参考图 + 文本驱动的视频生成。',
    hint: '参考图 + 文本驱动，支持音画同步生成。',
    inputModes: ['ref'],
    maxRefImages: 1,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      durationField([4, 5, 6, 7, 8, 9, 10, 11, 12]),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'radio-button',
        options: [
          { value: '480p', label: '480p' },
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
        ],
        default: '720p',
      },
      {
        key: 'ratio',
        label: '画面比例',
        type: 'radio-button',
        options: [
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
        ],
        default: '16:9',
      },
      {
        key: 'generate_audio',
        label: '生成音频',
        type: 'switch',
        default: true,
      },
      {
        key: 'camera_fixed',
        label: '固定镜头',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'watermark',
        label: '水印',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'seed',
        label: '随机种子',
        type: 'input-number',
        min: -1,
        step: 1,
        default: -1,
        group: 'advanced',
      },
    ],
  },

  /**
   * Doubao Seedance 1.5 Pro — 文生/图生统一 schema
   * 支持：纯文字 / 首帧图生 / 尾帧+首帧图生 / 参考图图生（三种图生互斥）
   * 文档：https://mapi.planisp.com/docs?menu=doubao-seedance-1-5-pro
   */
  'doubao-seedance-1-5-pro': {
    model: 'doubao-seedance-1-5-pro',
    displayName: 'Seedance 1.5 Pro',
    summary: '文生或图生视频，支持首帧/尾帧/参考图三种图生模式，原生音画同步。',
    hint: '首帧、首尾帧、参考图三种图生模式互斥；支持音频生成。',
    inputModes: ['text', 'frame', 'ref'],
    maxRefImages: 1,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    supportsPreview: false,
    supportsPreviewResolution: false,
    fields: [
      durationField([4, 5, 6, 7, 8, 9, 10, 11, 12]),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'radio-button',
        options: [
          { value: '480p', label: '480p' },
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
        ],
        default: '720p',
      },
      {
        key: 'ratio',
        label: '画面比例',
        type: 'radio-button',
        options: [
          { value: '16:9', label: '16:9 横屏' },
          { value: '9:16', label: '9:16 竖屏' },
          { value: '1:1', label: '1:1 方形' },
          { value: 'adaptive', label: '自适应' },
        ],
        default: '16:9',
        help: '选"自适应"时，比例由输入图片决定',
      },
      {
        key: 'generate_audio',
        label: '生成音频',
        type: 'switch',
        default: true,
        help: '开启后生成有声视频（Seedance 1.5 Pro 独有能力）',
      },
      {
        key: 'camera_fixed',
        label: '固定镜头',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'watermark',
        label: '水印',
        type: 'switch',
        default: false,
        group: 'advanced',
      },
      {
        key: 'seed',
        label: '随机种子',
        type: 'input-number',
        min: -1,
        step: 1,
        default: -1,
        group: 'advanced',
        help: '-1 表示随机，相同 seed + 相同输入可复现结果',
      },
    ],
  },
}

const aliasMap: Record<string, string> = {
  // Seedance 1.5 Pro 支持文生 + 图生（首帧/尾帧/参考图），使用统一 schema
  'doubao-seedance-1-5-pro-251215': 'doubao-seedance-1-5-pro',
  // Seedance 2.0 / 2.0 Fast 使用新的统一 schema（文生 + 首尾帧 + 参考图）
  'doubao-seedance-2-0-260128': 'doubao-seedance-2-0',
  'doubao-seedance-2-0-fast-260128': 'doubao-seedance-2-0',
  'Hailuo-2.3': 'hailuo-2.3',
}

export function resolveVideoSchema(model: string): VideoSchema | null {
  const key = aliasMap[model] || model
  return schemaMap[key] || null
}

export function buildDefaultVideoSchemaValue(model: string): Record<string, unknown> {
  const schema = resolveVideoSchema(model)
  if (!schema) return {}
  const out: Record<string, unknown> = {}
  for (const field of schema.fields) {
    if (field.default !== undefined) out[field.key] = field.default
  }
  return out
}

const providerLabelMap: Record<string, string> = {
  'doubao-seedance-2-0-260128': 'Seedance 2.0',
  'doubao-seedance-2-0-fast-260128': 'Seedance 2.0 Fast',
  'doubao-seedance-1-5-pro-251215': 'Seedance 1.5 Pro',
  'doubao-seedance-1-5-pro': 'Seedance 1.5 Pro',
  'doubao-seedance-text': 'Doubao Seedance',
  'doubao-seedance-image': 'Doubao Seedance',
  'Hailuo-2.3': 'Hailuo 2.3',
  'MiniMax-Hailuo-2.3': 'Hailuo 2.3',
}

export function buildVideoCardSummary(task: VideoTaskLike): {
  modelLabel: string
  metaLabel: string
  errorLabel: string
} {
  const params = (task.params || {}) as Record<string, unknown>
  const provider = String(task.provider || '').trim()
  const modelLabel = providerLabelMap[provider] || provider || '未命名模型'
  const ratio = String(params.ratio || params.aspectRatio || '').trim()
  const duration = Number(params.duration || 0)
  const resolution = String(params.resolution || '').trim()
  const parts = [
    ratio || '',
    duration > 0 ? `${duration}秒` : '',
    resolution || '',
  ].filter(Boolean)
  return {
    modelLabel,
    metaLabel: parts.join(' · '),
    errorLabel: String(task.errorMessage || '').trim(),
  }
}
