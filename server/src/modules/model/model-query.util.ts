import { BadRequestException } from '@nestjs/common';
import { FindOptionsWhere, Repository } from 'typeorm';
import { AiModel } from './model.entity';
import { extractUpstreamModelName } from '../../common/mapi-pricing';

export function compareAiModelsByRecency(a: AiModel, b: AiModel): number {
  const updatedDiff =
    new Date(a.updatedAt as any).getTime() - new Date(b.updatedAt as any).getTime();
  if (updatedDiff !== 0) return updatedDiff;
  const createdDiff =
    new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime();
  if (createdDiff !== 0) return createdDiff;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

export function dedupeAiModelsByModelName(models: AiModel[]): AiModel[] {
  const latestByName = new Map<string, AiModel>();
  for (const model of models) {
    const key = String(model?.modelName || '').trim();
    if (!key) continue;
    const current = latestByName.get(key);
    if (!current || compareAiModelsByRecency(model, current) > 0) {
      latestByName.set(key, model);
    }
  }
  return Array.from(latestByName.values()).sort(compareAiModelsByRecency);
}

export function resolveConsistentUpstreamModelName(
  models: AiModel[],
  fallbackModelName: string,
): string {
  const rows = [...models].sort(compareAiModelsByRecency);
  if (rows.length === 0) return fallbackModelName;
  const upstreamNames = Array.from(
    new Set(
      rows
        .map((row) => extractUpstreamModelName(row.rawMetadata) || row.modelName)
        .map((name) => String(name || '').trim())
        .filter(Boolean),
    ),
  );
  if (upstreamNames.length > 1) {
    throw new BadRequestException(
      `模型 ${fallbackModelName} 存在多条配置且上游 modelName 不一致，请在后台模型管理中清理重复项后重试`,
    );
  }
  return upstreamNames[0] || fallbackModelName;
}

/**
 * 按条件取一条模型记录。若存在同名 modelName 多行（如同步目录重复写入），
 * TypeORM 的 findOne 会抛错；此处取 updatedAt 最新的一条作为权威记录。
 */
export async function findFirstAiModel(
  repo: Repository<AiModel>,
  where: FindOptionsWhere<AiModel>,
): Promise<AiModel | null> {
  const rows = await repo.find({
    where,
    order: { updatedAt: 'DESC' },
    take: 1,
  });
  return rows[0] ?? null;
}
