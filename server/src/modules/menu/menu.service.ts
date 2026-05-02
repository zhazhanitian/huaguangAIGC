import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Menu } from './menu.entity';
import { CreateMenuDto } from './dto/create-menu.dto';

/** 树形菜单节点 */
export interface MenuTreeNode {
  id: string;
  name: string;
  icon: string | null;
  path: string | null;
  linkType: string;
  order: number;
  isVisible: boolean;
  children: MenuTreeNode[];
}

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
  ) {}

  /**
   * 获取可见菜单（树形结构）
   */
  async getVisibleMenus(): Promise<MenuTreeNode[]> {
    const menus = await this.menuRepository.find({
      where: { isVisible: true },
      order: { order: 'ASC', createdAt: 'ASC' },
    });
    return this.buildTree(menus, null);
  }

  private buildTree(menus: Menu[], parentId: string | null): MenuTreeNode[] {
    return menus
      .filter((m) => m.parentId === parentId)
      .map((m) => ({
        id: m.id,
        name: m.name,
        icon: m.icon,
        path: m.path,
        linkType: m.linkType,
        order: m.order,
        isVisible: m.isVisible,
        children: this.buildTree(menus, m.id),
      }));
  }

  /**
   * 创建菜单
   */
  async createMenu(dto: CreateMenuDto): Promise<Menu> {
    const menu = this.menuRepository.create({
      ...dto,
    });
    return this.menuRepository.save(menu);
  }

  /**
   * 更新菜单
   */
  async updateMenu(id: string, dto: Partial<CreateMenuDto>): Promise<Menu> {
    const menu = await this.menuRepository.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('菜单不存在');
    }
    Object.assign(menu, dto);
    return this.menuRepository.save(menu);
  }

  /**
   * 删除菜单
   */
  async deleteMenu(id: string): Promise<void> {
    const menu = await this.menuRepository.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('菜单不存在');
    }
    // 检查是否有子菜单
    const children = await this.menuRepository.count({
      where: { parentId: id },
    });
    if (children > 0) {
      throw new BadRequestException('请先删除子菜单');
    }
    await this.menuRepository.remove(menu);
  }

  /**
   * 获取所有菜单（扁平，管理员用）
   */
  async getAllMenus(): Promise<Menu[]> {
    return this.menuRepository.find({
      order: { order: 'ASC', createdAt: 'ASC' },
    });
  }
}
