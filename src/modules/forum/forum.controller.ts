import {
  Controller, Get, Post, Put, Delete, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ForumService, CreatePostDto, CreateCommentDto } from './forum.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';

@Controller('forum')
export class ForumController {
  constructor(private service: ForumService) {}

  // ─── Posts ───────────────────────────────────────────────
  @Get('posts')
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('posts/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @UseGuards(AuthGuard('jwt'), EmailVerifiedGuard)
  @Post('posts')
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePostDto) {
    return this.service.create(userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('posts/:id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: Partial<CreatePostDto>) {
    return this.service.update(id, userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('posts/:id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.remove(id, userId);
  }

  // ─── Draft management ────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Get('my-drafts')
  getMyDrafts(@CurrentUser('id') userId: string) {
    return this.service.getUserDrafts(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('posts/:id/publish')
  @HttpCode(HttpStatus.OK)
  publishDraft(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.publishDraft(id, userId);
  }

  // ─── Approval workflow (admin only — checked inside service for now) ──
  @UseGuards(AuthGuard('jwt'))
  @Get('admin/pending')
  getPendingPosts(@Query() query: any) {
    return this.service.getPendingPosts(query);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('admin/posts/:id/approve')
  @HttpCode(HttpStatus.OK)
  approvePost(@Param('id') id: string) {
    return this.service.approvePost(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('admin/posts/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectPost(@Param('id') id: string, @Body('reason') reason: string) {
    return this.service.rejectPost(id, reason);
  }

  // ─── Bulk operations ─────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('posts/bulk-delete')
  @HttpCode(HttpStatus.OK)
  bulkDelete(
    @Body('ids') ids: string[],
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.bulkDelete(ids, userId, role === 'admin');
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('admin/posts/bulk-approve')
  @HttpCode(HttpStatus.OK)
  bulkApprove(@Body('ids') ids: string[]) {
    return this.service.bulkApprove(ids);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('admin/posts/bulk-reject')
  @HttpCode(HttpStatus.OK)
  bulkReject(@Body('ids') ids: string[], @Body('reason') reason: string) {
    return this.service.bulkReject(ids, reason);
  }

  // ─── Likes ───────────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('posts/:id/like')
  @HttpCode(HttpStatus.OK)
  likePost(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.likePost(id, userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('posts/:id/liked')
  isLiked(@Param('id') postId: string, @CurrentUser('id') userId: string) {
    return this.service.getPostLikedByUser(postId, userId);
  }

  // ─── Comments ────────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('posts/:id/comments')
  addComment(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.service.addComment(postId, userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('comments/:id/like')
  @HttpCode(HttpStatus.OK)
  likeComment(@Param('id') commentId: string, @CurrentUser('id') userId: string) {
    return this.service.likeComment(commentId, userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('comments/:id/liked')
  isCommentLiked(@Param('id') commentId: string, @CurrentUser('id') userId: string) {
    return this.service.getCommentLikedByUser(commentId, userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('comments/:id')
  updateComment(
    @Param('id') commentId: string,
    @CurrentUser('id') userId: string,
    @Body('content') content: string,
  ) {
    return this.service.updateComment(commentId, userId, content);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('comments/:id')
  @HttpCode(HttpStatus.OK)
  deleteComment(@Param('id') commentId: string, @CurrentUser('id') userId: string) {
    return this.service.deleteComment(commentId, userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('comments/:id/pin')
  pinComment(@Param('id') commentId: string, @CurrentUser('id') userId: string) {
    return this.service.pinComment(commentId, userId);
  }
}
