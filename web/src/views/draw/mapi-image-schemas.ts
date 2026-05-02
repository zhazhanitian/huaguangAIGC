/**
 * MAPI 聚合平台图片模型的参数 schema 定义
 *
 * 对应文档：https://mapi.planisp.com/docs?menu=quick-start
 * 每个模型的字段集来自各自的文档页：
 *   - doubao-seedream-4-0 (Seedream 4.0)
 *   - doubao-seedream-4-5 (Seedream 4.5)  → 比 4.0 多 guidance_scale
 *   - doubao-seedream-5-0-lite (Seedream 5.0 Lite) → 比 4.5 多 thinking
 *   - grsai-nano-banana (Nano Banana) → 对应项目内 `nano-banana-pro` / `nano-banana-2`
 *
 * 渲染方式：`MapiImageParamForm.vue` 按 `fields` 数组顺序渲染。
 * group='basic' 直接展示；group='advanced' 收入折叠面板。
 * custom-size 字段由父字段内联渲染，不单独作为 FormItem。
 */

/** 字段分组：基础（默认展开）/ 高级（折叠面板） */
export type FieldGroup = 'basic' | 'advanced'

/** 字段通用修饰属性（混入每个字段变体） */
type FieldMeta = {
  group?: FieldGroup
  /** 返回 true 时显示该字段，false 时隐藏 */
  visibleWhen?: (v: Record<string, unknown>) => boolean
}

export type MapiImageField =
  | ({
      key: string
      label: string
      type: 'radio-button'
      options: Array<{ value: string | number; label: string }>
      default?: string | number
      help?: string
    } & FieldMeta)
  | ({
      key: string
      label: string
      type: 'custom-size'
      /** 关联的父字段 key（如 'size'），选中 customTrigger 时内联展开 */
      presetField: string
      presetOptions: Array<{ value: string; label: string }>
      /** 触发自定义输入的值（一般是 'custom'） */
      customTrigger: string
      /** 快速预设列表（WxH 字符串） */
      presets: string[]
      defaultCustom: string
      help?: string
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
      help?: string
      disabledWhen?: (v: Record<string, unknown>) => boolean
    } & FieldMeta)
  | ({
      key: string
      label: string
      type: 'slider'
      min: number
      max: number
      step: number
      default: number
      marks?: Record<number, string>
      help?: string
      disabledWhen?: (v: Record<string, unknown>) => boolean
    } & FieldMeta)
  | ({
      key: string
      label: string
      type: 'switch'
      default?: boolean
      /** 开启时 Switch 右侧显示的行内文字 */
      onText?: string
      /** 关闭时 Switch 右侧显示的行内文字 */
      offText?: string
      /** 静态帮助文字（与 helpOn/helpOff 二选一使用） */
      help?: string
      /** Switch 开启时动态显示的帮助文字 */
      helpOn?: string
      /** Switch 关闭时动态显示的帮助文字 */
      helpOff?: string
      /** 徽章：开启时展示警示标签（如"耗时更长"） */
      badge?: {
        type: 'warning' | 'info'
        text: string
        /** true：仅当 switch=true 时显示 */
        activeOnly?: boolean
      }
    } & FieldMeta)
  | ({
      key: string
      label: string
      type: 'ref-images'
      min: number
      max: number
      help?: string
    } & FieldMeta)

export interface MapiImageSchema {
  /** upstreamModelId，实际发给 MAPI 的 model 字段 */
  modelId: string
  displayName: string
  /** 顶部简介区展示的一句话描述 */
  summary: string
  fields: MapiImageField[]
}

/* ==================== Seedream 系列共用片段 ==================== */

const seedreamCommonFields: MapiImageField[] = [
  /* ---- 基础设置 ---- */
  {
    key: 'size',
    label: '输出分辨率',
    type: 'radio-button',
    options: [
      { value: '2K', label: '2K' },
      { value: '3K', label: '3K' },
      { value: 'custom', label: '自定义' },
    ],
    default: '2K',
    help: '2K / 3K 由模型按提示词自动决定比例；选"自定义"可指定精确宽高',
    group: 'basic',
  },
  {
    // 不单独渲染为 FormItem，由 size 字段内联展开
    key: '__custom_size__',
    label: '自定义尺寸',
    type: 'custom-size',
    presetField: 'size',
    customTrigger: 'custom',
    presetOptions: [],
    presets: ['2048x2048', '2560x1440', '1440x2560', '3072x3072'],
    defaultCustom: '2048x2048',
    help: '像素总量区间 [3,686,400 ~ 10,404,496]，宽高比 [1/16 ~ 16]',
    group: 'basic',
  },
  {
    key: 'image',
    label: '参考图',
    type: 'ref-images',
    min: 0,
    max: 14,
    help: '最多 14 张，支持 jpeg/png/webp/bmp/tiff/gif，单张 ≤10MB；为空时即文生图',
    group: 'basic',
  },
  {
    key: 'sequential_image_generation',
    label: '出图模式',
    type: 'radio-button',
    options: [
      { value: 'disabled', label: '单图' },
      { value: 'auto', label: '组图' },
    ],
    default: 'disabled',
    help: '组图模式一次性生成一批内容关联的图片',
    group: 'basic',
  },
  {
    key: 'sequential_image_generation_options.max_images',
    label: '组图最大数量',
    type: 'slider',
    min: 1,
    max: 15,
    step: 1,
    default: 15,
    marks: { 1: '1', 5: '5', 10: '10', 15: '15' },
    help: '参考图数量 + 组图数量 ≤ 15',
    group: 'basic',
    visibleWhen: (v) => v.sequential_image_generation === 'auto',
  },
  {
    key: 'n',
    label: '生成数量',
    type: 'input-number',
    min: 1,
    max: 15,
    step: 1,
    default: 1,
    help: '一次生成的图片张数',
    group: 'basic',
    visibleWhen: (v) => v.sequential_image_generation !== 'auto',
  },
  /* ---- 高级设置（折叠面板）---- */
  {
    key: 'optimize_prompt',
    label: '智能提示词优化',
    type: 'switch',
    default: false,
    helpOff: '保持原始提示词，不做修改',
    helpOn: '模型将自动改写提示词，提升生成细节和质量',
    group: 'advanced',
  },
  {
    key: 'optimize_prompt_options.mode',
    label: '优化模式',
    type: 'radio-button',
    options: [
      { value: 'standard', label: '质量优先' },
      { value: 'fast', label: '速度优先' },
    ],
    default: 'standard',
    help: '质量优先耗时稍长，速度优先生成更快',
    group: 'advanced',
    visibleWhen: (v) => v.optimize_prompt === true,
  },
  {
    key: 'seed',
    label: '随机种子',
    type: 'input-number',
    min: 0,
    step: 1,
    default: null,
    placeholder: '留空则随机，填入相同种子可复现结果',
    group: 'advanced',
  },
  {
    key: 'watermark',
    label: '添加水印',
    type: 'switch',
    default: false,
    helpOff: '不在生成图片上添加水印',
    helpOn: '由上游在生成图片上打标识水印',
    group: 'advanced',
  },
]

/* ==================== 具体 schemas ==================== */

const seedream40: MapiImageSchema = {
  modelId: 'doubao-seedream-4-0-250828',
  displayName: 'Doubao Seedream 4.0',
  summary: 'SOTA 级多模态图像模型，原生支持文本 / 单图 / 多图输入，4K 超高清直出、主体一致性强。',
  fields: seedreamCommonFields,
}

const seedream45: MapiImageSchema = {
  modelId: 'doubao-seedream-4-5-251128',
  displayName: 'Doubao Seedream 4.5',
  summary: '在 4.0 基础上新增引导强度控制，可精细调节画面与提示词的贴合程度。',
  fields: [
    ...seedreamCommonFields,
    {
      key: 'guidance_scale',
      label: '引导强度',
      type: 'slider',
      min: 1,
      max: 10,
      step: 0.5,
      default: 2.5,
      marks: { 1: '1', 2.5: '2.5', 5: '5', 7.5: '7.5', 10: '10' },
      help: '值越大越贴近提示词描述，过高可能损失自然感',
      group: 'basic',
    },
  ],
}

const seedream50Lite: MapiImageSchema = {
  modelId: 'doubao-seedream-5-0-260128',
  displayName: 'Doubao Seedream 5.0 Lite',
  summary: '在 4.5 基础上支持深度思考模式，多轮推演后出图，细节更丰富（耗时更长）。',
  fields: [
    ...seedreamCommonFields,
    {
      key: 'guidance_scale',
      label: '引导强度',
      type: 'slider',
      min: 1,
      max: 10,
      step: 0.5,
      default: 2.5,
      marks: { 1: '1', 2.5: '2.5', 5: '5', 7.5: '7.5', 10: '10' },
      help: '值越大越贴近提示词描述，过高可能损失自然感',
      group: 'basic',
    },
    {
      key: 'thinking',
      label: '深度思考模式',
      type: 'switch',
      default: false,
      helpOff: '快速生成（默认）',
      helpOn: '模型将多轮推演后出图，质量更高，耗时明显增加',
      badge: { type: 'warning', text: '耗时更长', activeOnly: true },
      group: 'basic',
    },
  ],
}

/* ==================== Nano Banana 系列 ==================== */

const nanoBananaFields: MapiImageField[] = [
  {
    key: 'imageSize',
    label: '输出分辨率',
    type: 'radio-button',
    options: [
      { value: '1K', label: '1K' },
      { value: '2K', label: '2K' },
      { value: '4K', label: '4K' },
    ],
    default: '2K',
    help: '支持 1K / 2K / 4K 预设，不支持自定义像素',
    group: 'basic',
  },
  {
    key: 'aspectRatio',
    label: '画面比例',
    type: 'radio-button',
    options: [
      { value: '1:1', label: '1:1' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
    ],
    default: '1:1',
    help: '选择画面的宽高比',
    group: 'basic',
  },
  {
    key: 'urls',
    label: '参考图',
    type: 'ref-images',
    min: 0,
    max: 4,
    help: '最多 4 张参考图；为空时即文生图',
    group: 'basic',
  },
]

const nanoBananaPro: MapiImageSchema = {
  modelId: 'nano-banana-pro',
  displayName: 'Nano Banana Pro',
  summary: 'GrsAI Nano Banana Pro：高速生成，支持多种分辨率和画面比例。',
  fields: nanoBananaFields,
}

const nanoBanana2: MapiImageSchema = {
  modelId: 'nano-banana-2',
  displayName: 'Nano Banana 2',
  summary: 'GrsAI Nano Banana 2：升级版质量更高，参数兼容 Pro，适合精细场景。',
  fields: nanoBananaFields,
}

/* ==================== 导出 ==================== */

export const mapiImageSchemas: Record<string, MapiImageSchema> = {
  'doubao-seedream-4-0-250828': seedream40,
  'doubao-seedream-4-5-251128': seedream45,
  'doubao-seedream-5-0-260128': seedream50Lite,
  'nano-banana-pro': nanoBananaPro,
  'nano-banana-2': nanoBanana2,
}

/** 前缀匹配兜底（例如 `doubao-seedream-4-0-xxxxx` 仍解析到 4.0 schema） */
const prefixMatchers: Array<[RegExp, string]> = [
  [/^doubao-seedream-4-0/i, 'doubao-seedream-4-0-250828'],
  [/^doubao-seedream-4-5/i, 'doubao-seedream-4-5-251128'],
  [/^doubao-seedream-5-0/i, 'doubao-seedream-5-0-260128'],
  [/^nano-banana-pro/i, 'nano-banana-pro'],
  [/^nano-banana-2/i, 'nano-banana-2'],
  [/^nano-banana$/i, 'nano-banana-pro'],
]

export function resolveMapiImageSchema(
  modelName: string | null | undefined,
): MapiImageSchema | null {
  if (!modelName) return null
  const name = String(modelName).trim()
  if (!name) return null

  if (mapiImageSchemas[name]) return mapiImageSchemas[name]

  for (const [pattern, key] of prefixMatchers) {
    if (pattern.test(name)) return mapiImageSchemas[key] ?? null
  }

  return null
}

/** 根据 schema 默认值构造初始 form value */
export function buildDefaultFormValue(
  schema: MapiImageSchema,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of schema.fields) {
    if (field.type === 'ref-images' || field.type === 'custom-size') continue
    if ('default' in field && field.default !== undefined) {
      setByPath(out, field.key, field.default as unknown)
    }
  }
  for (const field of schema.fields) {
    if (field.type === 'custom-size') {
      out.__customSize__ = field.defaultCustom
    }
  }
  return out
}

/** 支持 "a.b.c" 形式的路径写入 */
export function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segs = path.split('.')
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < segs.length - 1; i++) {
    const key = segs[i]!
    if (typeof cur[key] !== 'object' || cur[key] === null) {
      cur[key] = {}
    }
    cur = cur[key] as Record<string, unknown>
  }
  cur[segs[segs.length - 1]!] = value
}

/** 支持 "a.b.c" 形式的路径读取 */
export function getByPath(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const segs = path.split('.')
  let cur: unknown = obj
  for (const seg of segs) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}
