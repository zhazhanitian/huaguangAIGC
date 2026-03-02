import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  UseGuards,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { PaymentCallbackDto } from './dto/payment-callback.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { GetUser } from '../../common/decorators/user.decorator';
import { User } from '../user/user.entity';
import { Public } from '../../common/decorators/public.decorator';
import { PayType, OrderStatus } from './payment.entity';

@ApiTags('支付')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /** 公开：获取套餐列表 */
  @Public()
  @Get('packages')
  @ApiOperation({ summary: '获取套餐列表' })
  async getPackages() {
    return this.paymentService.getPackages();
  }

  /** 创建订单（需登录） */
  @Post('order/create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建订单' })
  async createOrder(@GetUser('id') userId: string, @Body() dto: CreateOrderDto) {
    return this.paymentService.createOrder(
      userId,
      dto.packageId,
      dto.payType,
    );
  }

  /** 微信支付回调（公开，支付平台回调） */
  @Public()
  @Post('callback/wechat')
  @ApiOperation({ summary: '微信支付回调' })
  async wechatCallback(@Body() dto: PaymentCallbackDto) {
    return this.paymentService.handlePaymentCallback(
      dto.orderNo,
      dto.tradeNo || '',
      PayType.WECHAT,
    );
  }

  /** 支付宝支付回调（公开） */
  @Public()
  @Post('callback/alipay')
  @ApiOperation({ summary: '支付宝支付回调' })
  async alipayCallback(@Body() dto: PaymentCallbackDto) {
    return this.paymentService.handlePaymentCallback(
      dto.orderNo,
      dto.tradeNo || '',
      PayType.ALIPAY,
    );
  }

  /** 我的订单 */
  @Get('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的订单列表' })
  async getMyOrders(
    @GetUser('id') userId: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    const p = page ? Number(page) : 1;
    const ps = pageSize ? Number(pageSize) : 10;
    return this.paymentService.getMyOrders(userId, p, ps);
  }

  // ========== Admin ==========

  /** 套餐列表（含下架） */
  @Get('admin/packages')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 套餐列表' })
  async getAllPackages() {
    return this.paymentService.getAllPackages();
  }

  /** 订单列表 */
  @Get('admin/orders')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 订单列表' })
  async getAllOrders(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: OrderStatus,
  ) {
    const p = page ? Number(page) : 1;
    const ps = pageSize ? Number(pageSize) : 20;
    return this.paymentService.getAllOrders(p, ps, status);
  }

  /** 订单统计 */
  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 订单统计' })
  async getOrderStats() {
    return this.paymentService.getOrderStats();
  }

  /** 创建套餐 */
  @Post('admin/packages')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 创建套餐' })
  async createPackage(@Body() dto: CreatePackageDto) {
    return this.paymentService.createPackage(dto);
  }

  /** 更新套餐 */
  @Put('admin/packages/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 更新套餐' })
  async updatePackage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePackageDto,
  ) {
    return this.paymentService.updatePackage(id, dto);
  }

  /** 删除套餐 */
  @Delete('admin/packages/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 删除套餐' })
  async deletePackage(@Param('id', ParseUUIDPipe) id: string) {
    await this.paymentService.deletePackage(id);
    return { message: '删除成功' };
  }
}
