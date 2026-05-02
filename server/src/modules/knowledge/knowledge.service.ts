import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  KnowledgeBase,
  KnowledgeDocument,
  DocumentStatus,
} from './knowledge.entity';
import { CreateBaseDto } from './dto/create-base.dto';
import { AddDocumentDto } from './dto/add-document.dto';

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(KnowledgeBase)
    private readonly baseRepository: Repository<KnowledgeBase>,
    @InjectRepository(KnowledgeDocument)
    private readonly docRepository: Repository<KnowledgeDocument>,
  ) {}

  /**
   * 创建知识库
   */
  async createBase(userId: string, dto: CreateBaseDto): Promise<KnowledgeBase> {
    const base = this.baseRepository.create({
      ...dto,
      userId,
    });
    return this.baseRepository.save(base);
  }

  /**
   * 获取用户的知识库列表（含可访问的公开库）
   */
  async getBases(userId: string): Promise<KnowledgeBase[]> {
    return this.baseRepository
      .createQueryBuilder('base')
      .where('base.userId = :userId', { userId })
      .orWhere('base.isPublic = :isPublic', { isPublic: true })
      .orderBy('base.createdAt', 'DESC')
      .getMany();
  }

  /**
   * 确保用户对知识库有权限
   */
  private async ensureBaseAccess(
    userId: string,
    baseId: string,
  ): Promise<KnowledgeBase> {
    const base = await this.baseRepository.findOne({ where: { id: baseId } });
    if (!base) {
      throw new NotFoundException('知识库不存在');
    }
    if (base.userId !== userId && !base.isPublic) {
      throw new ForbiddenException('无权访问');
    }
    return base;
  }

  /**
   * 确保用户对知识库有写权限
   */
  private async ensureBaseWrite(
    userId: string,
    baseId: string,
  ): Promise<KnowledgeBase> {
    const base = await this.baseRepository.findOne({ where: { id: baseId } });
    if (!base) {
      throw new NotFoundException('知识库不存在');
    }
    if (base.userId !== userId) {
      throw new ForbiddenException('无权修改');
    }
    return base;
  }

  /**
   * 添加文档
   */
  async addDocument(
    userId: string,
    baseId: string,
    dto: AddDocumentDto,
  ): Promise<KnowledgeDocument> {
    await this.ensureBaseWrite(userId, baseId);

    const doc = this.docRepository.create({
      knowledgeBaseId: baseId,
      title: dto.title,
      content: dto.content ?? null,
      fileUrl: dto.fileUrl ?? null,
      fileType: dto.fileUrl ? this.guessFileType(dto.fileUrl) : null,
      status: DocumentStatus.READY,
    });

    if (doc.content) {
      doc.chunkCount = Math.ceil(doc.content.length / 500);
    }

    return this.docRepository.save(doc);
  }

  private guessFileType(fileUrl: string): string {
    const ext = fileUrl.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      pdf: 'pdf',
      doc: 'word',
      docx: 'word',
      txt: 'text',
      md: 'markdown',
    };
    return map[ext] || 'unknown';
  }

  /**
   * 获取知识库下的文档列表
   */
  async getDocuments(
    baseId: string,
    userId: string,
  ): Promise<KnowledgeDocument[]> {
    await this.ensureBaseAccess(userId, baseId);
    return this.docRepository.find({
      where: { knowledgeBaseId: baseId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 删除文档
   */
  async deleteDocument(userId: string, docId: string): Promise<void> {
    const doc = await this.docRepository.findOne({ where: { id: docId } });
    if (!doc) {
      throw new NotFoundException('文档不存在');
    }
    await this.ensureBaseWrite(userId, doc.knowledgeBaseId);
    await this.docRepository.remove(doc);
  }

  /**
   * 知识库搜索（MVP：全文关键词搜索）
   * 在 content 中搜索 query，返回匹配的文档片段
   */
  async searchKnowledge(
    baseId: string,
    userId: string,
    query: string,
  ): Promise<{ documentId: string; title: string; excerpt: string }[]> {
    await this.ensureBaseAccess(userId, baseId);

    const docs = await this.docRepository.find({
      where: {
        knowledgeBaseId: baseId,
        status: DocumentStatus.READY,
      },
    });

    const results: { documentId: string; title: string; excerpt: string }[] =
      [];
    const q = query.trim().toLowerCase();
    if (!q) return results;

    for (const doc of docs) {
      const content = doc.content || '';
      const idx = content.toLowerCase().indexOf(q);
      if (idx >= 0) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(content.length, idx + q.length + 100);
        let excerpt = content.slice(start, end);
        if (start > 0) excerpt = '...' + excerpt;
        if (end < content.length) excerpt += '...';

        results.push({
          documentId: doc.id,
          title: doc.title,
          excerpt,
        });
      }
    }

    return results;
  }
}
