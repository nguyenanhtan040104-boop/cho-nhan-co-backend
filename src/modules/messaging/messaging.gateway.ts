import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MessagingService } from './messaging.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/messaging',
})
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map userId -> socketId
  private connectedUsers = new Map<string, string>();

  constructor(
    private messagingService: MessagingService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      const payload = this.jwtService.verify(token, { secret: this.config.get('JWT_SECRET') });
      client.data.userId = payload.sub;
      this.connectedUsers.set(payload.sub, client.id);
      console.log(`User ${payload.sub} connected`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.connectedUsers.delete(userId);
    }
  }

  @SubscribeMessage('join_conversation')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.join(`conversation:${data.conversationId}`);
    return { status: 'joined' };
  }

  @SubscribeMessage('leave_conversation')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string; type?: string; fileUrl?: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    try {
      const message = await this.messagingService.sendMessage(userId, data);

      // Broadcast đến conversation room
      this.server.to(`conversation:${data.conversationId}`).emit('new_message', message);

      // Gửi notification đến receiver nếu đang online
      const conversation = await this.messagingService.getConversationParticipants(data.conversationId);
      for (const participant of conversation) {
        if (participant.userId !== userId) {
          const receiverSocketId = this.connectedUsers.get(participant.userId);
          if (receiverSocketId) {
            this.server.to(receiverSocketId).emit('new_notification', {
              type: 'MESSAGE',
              title: 'Tin nhắn mới',
              data: { conversationId: data.conversationId },
            });
          }
        }
      }

      return message;
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.to(`conversation:${data.conversationId}`).emit('user_typing', {
      userId: client.data.userId,
      conversationId: data.conversationId,
    });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.to(`conversation:${data.conversationId}`).emit('user_stop_typing', {
      userId: client.data.userId,
    });
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId;
    await this.messagingService.markRead(data.conversationId, userId);
    client.to(`conversation:${data.conversationId}`).emit('message_read', {
      userId,
      conversationId: data.conversationId,
    });
  }

  // Gửi notification realtime từ service khác
  sendNotification(userId: string, notification: any) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('new_notification', notification);
    }
  }
}
