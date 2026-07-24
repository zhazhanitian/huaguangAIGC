import OpenAI from 'openai';

/**
 * Planisp MAPI（OpenAI 兼容接口）
 * 文档：https://mapi.planisp.com/docs?menu=quick-start
 *
 * 启用后：对话主链路与其它使用 OpenAI SDK 的模块优先走 MAPI，而不再依赖各厂商分散 Key。
 */
export function isPlanispMapiEnabled(): boolean {
  const e = process.env.MAPI_ENABLED ?? process.env.PLANISP_ENABLED;
  return ['true', '1', 'yes'].includes(String(e ?? '').toLowerCase().trim());
}

export function getPlanispApiKey(): string {
  return String(process.env.MAPI_API_KEY || process.env.PLANISP_API_KEY || '').trim();
}

/** 默认与文档常见写法一致：根域名 + /v1 */
export function normalizeMapiBaseUrl(): string {
  const fallback = 'https://server.mapi.zone/Mapi/v3';
  let base = String(process.env.MAPI_BASE_URL || fallback).trim().replace(/\/+$/, '');
  return base;
}

/** 文档 / PPT / 脑图等辅助能力：与主对话一致走 MAPI（若启用），否则回退 OPENAI_* */
export function createPlanispOrDefaultOpenAI(): OpenAI {
  if (isPlanispMapiEnabled() && getPlanispApiKey()) {
    return new OpenAI({
      apiKey: getPlanispApiKey(),
      baseURL: normalizeMapiBaseUrl(),
    });
  }
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error(
      '请配置 MAPI_ENABLED=true 与 MAPI_API_KEY，或配置 OPENAI_API_KEY',
    );
  }
  const base = String(process.env.OPENAI_BASE_URL || '').trim();
  return new OpenAI({
    apiKey,
    baseURL: base || undefined,
  });
}

/** 辅助任务使用的模型名（需在 MAPI 侧可用） */
export function resolveAuxiliaryLlmModel(): string {
  return (
    process.env.MAPI_AUX_MODEL?.trim() ||
    process.env.MAPI_CHAT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-4o-mini'
  );
}
