export type Model3dFieldGroup = 'basic' | 'advanced'

export interface Model3dFieldOption {
  value: string | number | boolean
  label: string
}

type VisibleContext = {
  taskType: 'text2model' | 'img2model'
  provider: string
}

type FieldMeta = {
  group?: Model3dFieldGroup
  help?: string
  visibleWhen?: (value: Record<string, unknown>, ctx: VisibleContext) => boolean
}

export type Model3dField =
  | ({
    key: string
    label: string
    type: 'radio-button'
    options: Model3dFieldOption[]
    default?: string | number | boolean
  } & FieldMeta)
  | ({
    key: string
    label: string
    type: 'select'
    options: Model3dFieldOption[]
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

export interface Model3dSchema {
  provider: string
  displayName: string
  summary: string
  fields: Model3dField[]
}

const tencentProSchema: Model3dSchema = {
  provider: 'tencent-hunyuan-3d-pro',
  displayName: '腾讯混元 3D 专业版',
  summary: '高质量生成，适合精细模型与导出场景。',
  fields: [
    {
      key: 'model',
      label: '模型版本',
      type: 'radio-button',
      options: [
        { value: '3.0', label: '3.0' },
        { value: '3.1', label: '3.1' },
      ],
      default: '3.1',
      help: '3.1 质量更高，适合复杂细节。',
    },
    {
      key: 'whiteModel',
      label: '模型类型',
      type: 'radio-button',
      options: [
        { value: true, label: '白模' },
        { value: false, label: '贴图' },
      ],
      default: false,
      help: '白模更适合后续二次制作，贴图更适合直接预览与打印。',
    },
    {
      key: 'lightingPreset',
      label: '光影预设',
      type: 'select',
      options: [
        { value: 'studio', label: '工作室光' },
        { value: 'outdoor', label: '户外天光' },
        { value: 'dramatic', label: '戏剧光影' },
      ],
      default: 'studio',
    },
    {
      key: 'exportFormat',
      label: '导出格式',
      type: 'select',
      options: [
        { value: '', label: '默认（返回 OBJ + GLB）' },
        { value: 'stl', label: 'STL' },
        { value: 'usdz', label: 'USDZ' },
        { value: 'fbx', label: 'FBX' },
      ],
      default: '',
    },
  ],
}

const tencentRapidSchema: Model3dSchema = {
  provider: 'tencent-hunyuan-3d-rapid',
  displayName: '腾讯混元 3D 极速版',
  summary: '更快出结果，适合快速迭代与概念验证。',
  fields: [
    {
      key: 'whiteModel',
      label: '模型类型',
      type: 'radio-button',
      options: [
        { value: true, label: '白模' },
        { value: false, label: '贴图' },
      ],
      default: false,
    },
    {
      key: 'textureStyle',
      label: '贴图风格',
      type: 'select',
      options: [
        { value: 'general', label: '通用' },
        { value: 'stone', label: '石雕' },
        { value: 'porcelain', label: '青花瓷' },
        { value: 'cartoon', label: '卡通' },
        { value: 'cyberpunk', label: '赛博朋克' },
      ],
      default: 'general',
    },
    {
      key: 'lightingPreset',
      label: '光影预设',
      type: 'select',
      options: [
        { value: 'studio', label: '工作室光' },
        { value: 'outdoor', label: '户外天光' },
        { value: 'dramatic', label: '戏剧光影' },
      ],
      default: 'studio',
    },
    {
      key: 'exportFormat',
      label: '导出格式',
      type: 'select',
      options: [
        { value: '', label: '默认（返回 OBJ）' },
        { value: 'obj', label: 'OBJ' },
        { value: 'glb', label: 'GLB' },
        { value: 'stl', label: 'STL' },
        { value: 'usdz', label: 'USDZ' },
        { value: 'fbx', label: 'FBX' },
        { value: 'mp4', label: 'MP4' },
      ],
      default: '',
    },
  ],
}

const tripoSchema: Model3dSchema = {
  provider: 'tripo3d',
  displayName: 'Tripo 3D',
  summary: 'Tripo 官方 3D 生成，参数与官网保持一致，支持文生与图生。',
  fields: [
    {
      key: 'model_version',
      label: '模型版本',
      type: 'select',
      options: [
        { value: 'v2.5-20250123', label: 'v2.5（推荐）' },
      ],
      default: 'v2.5-20250123',
      help: '第一版先提供当前已验证的一档官方版本。',
    },
    {
      key: 'texture',
      label: '生成贴图',
      type: 'switch',
      default: true,
      onText: '输出贴图',
      offText: '仅几何',
      help: '关闭后更偏白模，适合后续自己重做材质。',
    },
    {
      key: 'pbr',
      label: 'PBR 材质',
      type: 'switch',
      default: true,
      onText: '包含 PBR',
      offText: '关闭 PBR',
      help: '开启后会生成更完整的物理材质信息。',
    },
    {
      key: 'texture_quality',
      label: '贴图质量',
      type: 'radio-button',
      options: [
        { value: 'standard', label: '标准' },
        { value: 'detailed', label: '精细' },
      ],
      default: 'standard',
      group: 'advanced',
    },
    {
      key: 'face_limit',
      label: '面数上限',
      type: 'input-number',
      min: 1000,
      max: 500000,
      step: 1000,
      default: null,
      placeholder: '留空由官方自动决定',
      group: 'advanced',
      help: '限制生成后的面片数量，越高细节通常越丰富。',
    },
    {
      key: 'auto_size',
      label: '自动尺寸推断',
      type: 'switch',
      default: false,
      group: 'advanced',
    },
    {
      key: 'quad',
      label: '四边面拓扑',
      type: 'switch',
      default: false,
      group: 'advanced',
    },
    {
      key: 'compress',
      label: '压缩几何体',
      type: 'switch',
      default: false,
      group: 'advanced',
    },
    {
      key: 'generate_parts',
      label: '生成分件',
      type: 'switch',
      default: false,
      group: 'advanced',
    },
    {
      key: 'smart_low_poly',
      label: '智能低模',
      type: 'switch',
      default: false,
      group: 'advanced',
    },
    {
      key: 'texture_alignment',
      label: '贴图对齐方式',
      type: 'radio-button',
      options: [
        { value: 'original_image', label: '贴近原图外观' },
        { value: 'geometry', label: '贴近几何结构' },
      ],
      default: 'original_image',
      group: 'advanced',
      visibleWhen: (_value, ctx) => ctx.taskType === 'img2model',
      help: '图生 3D 时，决定更优先还原原图还是服从几何结构。',
    },
    {
      key: 'orientation',
      label: '模型朝向策略',
      type: 'radio-button',
      options: [
        { value: 'default', label: '默认' },
        { value: 'align_image', label: '跟随图片朝向' },
      ],
      default: 'default',
      group: 'advanced',
      visibleWhen: (_value, ctx) => ctx.taskType === 'img2model',
      help: '图生 3D 时，可尝试根据原图视角自动调整模型朝向。',
    },
  ],
}

const exactSchemas: Record<string, Model3dSchema> = {
  'tencent-hunyuan-3d-pro': tencentProSchema,
  'tencent-hunyuan-3d-rapid': tencentRapidSchema,
  'tripo3d-text-to-model': tripoSchema,
  'tripo3d-image-to-model': tripoSchema,
}

export function resolveModel3dSchema(provider: string): Model3dSchema | null {
  const name = String(provider || '').trim()
  if (!name) return null
  if (exactSchemas[name]) return exactSchemas[name]
  if (name.startsWith('tripo3d')) return tripoSchema
  if (name.includes('rapid')) return tencentRapidSchema
  if (name.includes('pro')) return tencentProSchema
  return null
}

export function buildDefaultModel3dParams(provider: string): Record<string, unknown> {
  const schema = resolveModel3dSchema(provider)
  if (!schema) return {}
  const out: Record<string, unknown> = {}
  for (const field of schema.fields) {
    if (field.default !== undefined) out[field.key] = field.default
  }
  return out
}
