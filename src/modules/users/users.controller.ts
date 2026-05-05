import { Controller, Get, Put, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService, UpdateProfileDto } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.getMe(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('me')
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('me/identity')
  submitIdentity(
    @CurrentUser('id') userId: string,
    @Body() data: { cccdFrontUrl: string; cccdBackUrl: string; selfieUrl: string },
  ) {
    return this.usersService.submitIdentity(userId, data);
  }

  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }

  @Get(':id/products')
  getUserProducts(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '12',
  ) {
    return this.usersService.getUserProducts(id, +page, +limit);
  }
}
