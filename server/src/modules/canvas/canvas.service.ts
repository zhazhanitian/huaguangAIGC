import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanvasProject } from './canvas-project.entity';
import { CanvasNode, CanvasNodeStatus } from './canvas-node.entity';
import { CreateCanvasProjectDto } from './dto/create-canvas-project.dto';
import { UpdateCanvasProjectDto } from './dto/update-canvas-project.dto';
import { CreateCanvasNodeDto } from './dto/create-canvas-node.dto';
import { UpdateCanvasNodeDto } from './dto/update-canvas-node.dto';
import { CreateCanvasNodeTaskDto } from './dto/create-canvas-node-task.dto';
import { DrawService } from '../draw/draw.service';
import { CreateDrawTaskDto } from '../draw/dto/create-draw-task.dto';

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(CanvasProject)
    private readonly projectRepository: Repository<CanvasProject>,
    @InjectRepository(CanvasNode)
    private readonly nodeRepository: Repository<CanvasNode>,
    private readonly drawService: DrawService,
  ) {}

  async createProject(
    userId: string,
    dto: CreateCanvasProjectDto,
  ): Promise<CanvasProject> {
    const project = this.projectRepository.create({
      userId,
      name: dto.name,
      description: dto.description ?? null,
      viewport: dto.viewport ?? null,
      snapshot: dto.snapshot ?? null,
      nodeCount: 0,
    });
    return this.projectRepository.save(project);
  }

  async getProjects(
    userId: string,
    page: number = 1,
    pageSize: number = 12,
  ): Promise<{
    list: CanvasProject[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.projectRepository.findAndCount({
      where: { userId },
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async getAllProjects(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    list: CanvasProject[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.projectRepository.findAndCount({
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async getProjectDetail(userId: string, projectId: string) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });
    if (!project || project.userId !== userId) {
      throw new NotFoundException('画布项目不存在');
    }
    const nodes = await this.nodeRepository.find({
      where: { projectId, userId },
      order: { createdAt: 'ASC' },
    });
    return { project, nodes };
  }

  async updateProject(
    userId: string,
    projectId: string,
    dto: UpdateCanvasProjectDto,
  ): Promise<CanvasProject> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
    });
    if (!project) throw new NotFoundException('画布项目不存在');
    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    if (dto.viewport !== undefined) project.viewport = dto.viewport;
    if (dto.snapshot !== undefined) project.snapshot = dto.snapshot;
    return this.projectRepository.save(project);
  }

  async createNode(
    userId: string,
    projectId: string,
    dto: CreateCanvasNodeDto,
  ): Promise<CanvasNode> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, userId },
    });
    if (!project) throw new NotFoundException('画布项目不存在');
    const node = this.nodeRepository.create({
      userId,
      projectId,
      title: dto.title,
      prompt: dto.prompt,
      negativePrompt: dto.negativePrompt ?? null,
      position: dto.position ?? null,
      tag: dto.tag ?? null,
      size: dto.size ?? null,
      style: dto.style ?? null,
      provider: dto.provider ?? null,
      taskType: dto.taskType ?? null,
      params: dto.params ?? null,
      status: CanvasNodeStatus.IDLE,
      progress: null,
    });
    const saved = await this.nodeRepository.save(node);
    project.nodeCount = (project.nodeCount || 0) + 1;
    await this.projectRepository.save(project);
    return saved;
  }

  async updateNode(
    userId: string,
    nodeId: string,
    dto: UpdateCanvasNodeDto,
  ): Promise<CanvasNode> {
    const node = await this.nodeRepository.findOne({
      where: { id: nodeId, userId },
    });
    if (!node) throw new NotFoundException('节点不存在');
    Object.assign(node, {
      title: dto.title ?? node.title,
      prompt: dto.prompt ?? node.prompt,
      negativePrompt: dto.negativePrompt ?? node.negativePrompt,
      position: dto.position ?? node.position,
      tag: dto.tag ?? node.tag,
      size: dto.size ?? node.size,
      style: dto.style ?? node.style,
      provider: dto.provider ?? node.provider,
      taskType: dto.taskType ?? node.taskType,
      status: (dto.status as CanvasNodeStatus) ?? node.status,
      progress: dto.progress ?? node.progress,
      taskId: dto.taskId ?? node.taskId,
      resultUrl: dto.resultUrl ?? node.resultUrl,
      previewUrl: dto.previewUrl ?? node.previewUrl,
      params: dto.params ?? node.params,
    });
    return this.nodeRepository.save(node);
  }

  async deleteNode(userId: string, nodeId: string) {
    const node = await this.nodeRepository.findOne({
      where: { id: nodeId, userId },
    });
    if (!node) throw new NotFoundException('节点不存在');
    await this.nodeRepository.remove(node);
    const project = await this.projectRepository.findOne({
      where: { id: node.projectId, userId },
    });
    if (project) {
      project.nodeCount = Math.max(0, (project.nodeCount || 1) - 1);
      await this.projectRepository.save(project);
    }
    return { message: '删除成功' };
  }

  async createNodeTask(
    userId: string,
    nodeId: string,
    dto: CreateCanvasNodeTaskDto,
  ) {
    const node = await this.nodeRepository.findOne({
      where: { id: nodeId, userId },
    });
    if (!node) throw new NotFoundException('节点不存在');

    const provider = dto.provider || node.provider || 'nano-banana-pro';
    const prompt = dto.prompt || node.prompt;
    const negativePrompt =
      dto.negativePrompt ?? node.negativePrompt ?? undefined;
    const taskType = dto.taskType || node.taskType || 'text2img';

    const mergedParams: Record<string, unknown> = {
      ...(node.params || {}),
      ...(dto.params || {}),
    };
    const size = dto.size || node.size;
    const style = dto.style || node.style;
    if (size) mergedParams.size = size;
    if (style) mergedParams.style = style;

    const payload: CreateDrawTaskDto = {
      source: 'canvas',
      provider,
      prompt,
      taskType,
      negativePrompt,
      params: Object.keys(mergedParams).length ? mergedParams : undefined,
    };

    const task = await this.drawService.createTask(userId, payload);

    node.provider = provider;
    node.taskType = taskType;
    node.prompt = prompt;
    node.negativePrompt = negativePrompt ?? null;
    node.size = size ?? null;
    node.style = style ?? null;
    node.params = Object.keys(mergedParams).length ? mergedParams : null;
    node.taskId = task.id;
    node.status = CanvasNodeStatus.RUNNING;
    node.progress = task.progress ?? 0;
    node.resultUrl = task.imageUrl || node.resultUrl;
    node.previewUrl = task.imageUrl || node.previewUrl;

    const saved = await this.nodeRepository.save(node);
    return { node: saved, task };
  }
}
