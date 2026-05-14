import { Controller, Get, Post, Body, Param, Query, UseGuards, RawBodyRequest, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WalletService } from './wallet.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('wallet')
export class WalletController {
  constructor(private walletService: WalletService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  getWallet(@CurrentUser('id') userId: string) {
    return this.walletService.getWallet(userId);
  }

  // Tạo QR thanh toán qua PayOS
  @UseGuards(AuthGuard('jwt'))
  @Post('create-payment')
  createPayment(
    @CurrentUser('id') userId: string,
    @Body() body: { amount: number },
  ) {
    return this.walletService.createPaymentLink(userId, body.amount);
  }

  // Kiểm tra trạng thái thanh toán (frontend polling)
  @UseGuards(AuthGuard('jwt'))
  @Get('payment-status/:orderCode')
  checkPaymentStatus(
    @Param('orderCode') orderCode: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.walletService.checkPaymentStatus(orderCode, userId);
  }

  // Webhook từ PayOS (không cần auth)
  @Post('webhook/payos')
  payosWebhook(@Body() body: any) {
    return this.walletService.handlePayosWebhook(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('buy-vip')
  buyVip(
    @CurrentUser('id') userId: string,
    @Body() body: { refType: 'product' | 'job' | 'real_estate'; refId: string; durationDays?: number },
  ) {
    return this.walletService.buyVip(userId, body.refType, body.refId, body.durationDays);
  }

  // Admin endpoints
  @UseGuards(AuthGuard('jwt'))
  @Get('admin/pending')
  getPendingTopUps() {
    return this.walletService.getPendingTopUps();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('admin/transactions')
  getAllTransactions(@Query() query: any) {
    return this.walletService.getAllTransactions(query);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('admin/confirm/:id')
  confirmTopUp(@Param('id') id: string, @Body() body: { adminNote?: string }) {
    return this.walletService.confirmTopUp(id, body.adminNote);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('admin/reject/:id')
  rejectTopUp(@Param('id') id: string, @Body() body: { adminNote?: string }) {
    return this.walletService.rejectTopUp(id, body.adminNote);
  }
}
