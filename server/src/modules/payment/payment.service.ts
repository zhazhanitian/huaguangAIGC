import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, Package, OrderStatus, PayType } from './payment.entity';
import { UserService } from '../user/user.service';

/**
 * 支付服务
 * 套餐管理、订单创建、支付回调处理
 */
@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Package)
    private readonly packageRepository: Repository<Package>,
    private readonly userService: UserService,
  ) {}

  /**
   * 获取启用的套餐列表（公开）
   */
  async getPackages(): Promise<Package[]> {
    return this.packageRepository.find({
      where: { isActive: true },
      order: { order: 'ASC', createdAt: 'DESC' },
    });
  }

  /**
   * 根据 ID 获取套餐
   */
  async getPackageById(id: string): Promise<Package> {
    const pkg = await this.packageRepository.findOne({ where: { id } });
    if (!pkg) {
      throw new NotFoundException('套餐不存在');
    }
    return pkg;
  }

  /**
   * 生成唯一订单号
   */
  private generateOrderNo(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD${timestamp}${random}`;
  }

  /**
   * 创建订单
   */
  async createOrder(
    userId: string,
    packageId: string,
    payType: PayType,
  ): Promise<Order> {
    const pkg = await this.getPackageById(packageId);
    if (!pkg.isActive) {
      throw new BadRequestException('该套餐已下架');
    }

    // 确保订单号唯一
    let orderNo: string;
    let exists: Order | null;
    do {
      orderNo = this.generateOrderNo();
      exists = await this.orderRepository.findOne({ where: { orderNo } });
    } while (exists);

    const order = this.orderRepository.create({
      orderNo,
      userId,
      packageId: pkg.id,
      amount: pkg.price,
      payType,
      status: OrderStatus.PENDING,
    });

    return this.orderRepository.save(order);
  }

  /**
   * 处理支付回调：验证、更新订单、发放积分/会员
   */
  async handlePaymentCallback(
    orderNo: string,
    tradeNo: string,
    payType: PayType,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { orderNo },
      relations: ['package'],
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (order.status === OrderStatus.PAID) {
      return order; // 已处理，幂等
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('订单状态不允许支付');
    }

    // 此处应调用各支付渠道验签，此处简化处理
    order.status = OrderStatus.PAID;
    order.tradeNo = tradeNo;
    order.payTime = new Date();
    await this.orderRepository.save(order);

    const pkg = order.package || (await this.getPackageById(order.packageId));

    // 发放积分
    if (pkg.points > 0) {
      await this.userService.addBalance(order.userId, pkg.points);
    }

    // 延长会员
    if (pkg.memberDays > 0) {
      await this.userService.extendMembership(order.userId, pkg.memberDays);
    }

    return order;
  }

  /**
   * 获取当前用户订单列表（分页）
   */
  async getMyOrders(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{
    list: Order[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * pageSize;
    const [list, total] = await this.orderRepository.findAndCount({
      where: { userId },
      relations: ['package'],
      order: { createdAt: 'DESC' },
      skip,
      take: pageSize,
    });

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ========== Admin ==========

  /**
   * 获取所有套餐（含下架）
   */
  async getAllPackages(): Promise<Package[]> {
    return this.packageRepository.find({
      order: { order: 'ASC', createdAt: 'DESC' },
    });
  }

  /**
   * 获取所有订单（分页）
   */
  async getAllOrders(
    page: number = 1,
    pageSize: number = 20,
    status?: OrderStatus,
  ): Promise<{
    list: Order[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * pageSize;
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.package', 'package')
      .orderBy('order.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize);

    if (status) {
      qb.andWhere('order.status = :status', { status });
    }

    const [list, total] = await qb.getManyAndCount();

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 创建套餐
   */
  async createPackage(dto: {
    name: string;
    description?: string;
    price: number;
    points: number;
    memberDays: number;
    isActive?: boolean;
    order?: number;
  }): Promise<Package> {
    const pkg = this.packageRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      price: dto.price,
      points: dto.points,
      memberDays: dto.memberDays,
      isActive: dto.isActive ?? true,
      order: dto.order ?? 0,
    });
    return this.packageRepository.save(pkg);
  }

  /**
   * 更新套餐
   */
  async updatePackage(
    id: string,
    updates: Partial<
      Pick<
        Package,
        | 'name'
        | 'description'
        | 'price'
        | 'points'
        | 'memberDays'
        | 'isActive'
        | 'order'
      >
    >,
  ): Promise<Package> {
    const pkg = await this.getPackageById(id);
    Object.assign(pkg, updates);
    return this.packageRepository.save(pkg);
  }

  /**
   * 删除套餐
   */
  async deletePackage(id: string): Promise<void> {
    const pkg = await this.getPackageById(id);
    await this.packageRepository.remove(pkg);
  }

  /**
   * 订单统计
   */
  async getOrderStats(): Promise<{
    totalOrders: number;
    paidOrders: number;
    totalRevenue: number;
    todayRevenue: number;
  }> {
    const totalOrders = await this.orderRepository.count();
    const paidOrders = await this.orderRepository.count({
      where: { status: OrderStatus.PAID },
    });

    const revenueResult = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.amount)', 'total')
      .where('order.status = :status', { status: OrderStatus.PAID })
      .getRawOne<{ total: string }>();

    const totalRevenue = parseFloat(revenueResult?.total || '0');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayResult = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.amount)', 'total')
      .where('order.status = :status', { status: OrderStatus.PAID })
      .andWhere('order.payTime >= :today', { today: todayStart })
      .getRawOne<{ total: string }>();

    const todayRevenue = parseFloat(todayResult?.total || '0');

    return { totalOrders, paidOrders, totalRevenue, todayRevenue };
  }
}
