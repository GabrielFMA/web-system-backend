import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { PrismaService } from '../../prisma/prisma.service';
import { Server, Socket } from 'socket.io';

type RealtimeJwtPayload = {
  sub?: number;
  sid?: string;
};

type AuthenticatedSocket = Socket & {
  data: {
    userId?: number;
    sessionId?: string;
    userUid?: string;
    userEnrollment?: string;
  };
};

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  @WebSocketServer()
  server: Server;

  async handleConnection(client: AuthenticatedSocket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<RealtimeJwtPayload>(token);

      if (!payload.sub || !payload.sid) {
        client.disconnect(true);
        return;
      }

      const session = await this.prisma.session.findFirst({
        where: {
          id: payload.sid,
          userId: payload.sub,
          revoked: false,
        },
      });

      if (!session) {
        client.disconnect(true);
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          uid: true,
          enrollment: true,
        },
      });

      if (!user) {
        client.disconnect(true);
        return;
      }

      client.data.userId = payload.sub;
      client.data.sessionId = payload.sid;
      client.data.userUid = user.uid;
      client.data.userEnrollment = user.enrollment;

      client.join(this.getUserRoom(payload.sub));
      client.join(this.getSessionRoom(payload.sid));

      await this.prisma.session.update({
        where: { id: payload.sid },
        data: {
          isOnline: true,
          lastSeen: new Date(),
        },
      });

      this.emit('presence_changed', {
        userId: payload.sub,
        userUid: user.uid,
        userEnrollment: user.enrollment,
        sessionId: payload.sid,
        online: true,
        lastSeen: new Date(),
      });
    } catch (error) {
      this.logger.warn(`Socket auth failed: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const { userId, sessionId, userUid, userEnrollment } = client.data;
    if (!userId || !sessionId || !userUid || !userEnrollment) {
      return;
    }

    const sessionRoomSize =
      this.server.sockets.adapter.rooms.get(this.getSessionRoom(sessionId))
        ?.size ?? 0;

    if (sessionRoomSize > 0) {
      return;
    }

    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
      },
      data: {
        isOnline: false,
        lastSeen: new Date(),
      },
    });

    this.emit('presence_changed', {
      userId,
      userUid,
      userEnrollment,
      sessionId,
      online: false,
      lastSeen: new Date(),
    });
  }

  emit(event: string, data: unknown) {
    this.server.emit(event, data);
  }

  emitToUser(userId: number, event: string, data: unknown) {
    this.server.to(this.getUserRoom(userId)).emit(event, data);
  }

  emitToSession(sessionId: string, event: string, data: unknown) {
    this.server.to(this.getSessionRoom(sessionId)).emit(event, data);
  }

  async disconnectSession(sessionId: string) {
    const sockets = await this.server.in(this.getSessionRoom(sessionId)).fetchSockets();
    for (const socket of sockets) {
      socket.disconnect(true);
    }
  }

  async disconnectUserSessions(userId: number) {
    const sockets = await this.server.in(this.getUserRoom(userId)).fetchSockets();
    for (const socket of sockets) {
      socket.disconnect(true);
    }
  }

  private getUserRoom(userId: number) {
    return `user:${userId}`;
  }

  private getSessionRoom(sessionId: string) {
    return `session:${sessionId}`;
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    const headerToken = client.handshake.headers.authorization;

    const rawToken =
      typeof authToken === 'string'
        ? authToken
        : typeof headerToken === 'string'
          ? headerToken
          : null;

    if (!rawToken) {
      return null;
    }

    if (rawToken.startsWith('Bearer ')) {
      return rawToken.slice(7);
    }

    return rawToken;
  }
}
