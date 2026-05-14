import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
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

  @UseGuards(AuthGuard('jwt'))
  @Post('top-up')
  requestTopUp(
    @CurrentUser('id') userId: string,
    @Body() body: { amount: number; note?: string },
  ) {
    return this.walletService.requestTopUp(userId, body.amount, body.note);
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
