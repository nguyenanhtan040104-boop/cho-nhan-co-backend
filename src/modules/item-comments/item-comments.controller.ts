import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ItemCommentsService } from './item-comments.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('item-comments')
export class ItemCommentsController {
  constructor(private readonly service: ItemCommentsService) {}

  @Get()
  getComments(
    @Query('targetType') targetType: string,
    @Query('targetId') targetId: string,
  ) {
    return this.service.getComments(targetType, targetId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  createComment(
    @Request() req: any,
    @Body() body: { targetType: string; targetId: string; content: string; parentId?: string },
  ) {
    return this.service.createComment(req.user.sub || req.user.id, body);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  deleteComment(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteComment(req.user.sub || req.user.id, id);
  }
}
