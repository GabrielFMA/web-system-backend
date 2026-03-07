import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { PermissionEffect } from '@prisma/client';
import { RealtimeGateway } from 'src/realtime/realtime.gateway';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async login(data: LoginDto) {
    const { email, password } = data;

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        groups: {
          include: {
            group: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const groupPermissions =
      user.groups.flatMap((group) =>
        group.group.permissions.map((permission) => permission.permission.code),
      ) ?? [];

    const allowDirectPermissions = user.permissions
      .filter((permission) => permission.effect === PermissionEffect.ALLOW)
      .map((permission) => permission.permission.code);

    const denyDirectPermissions = user.permissions
      .filter((permission) => permission.effect === PermissionEffect.DENY)
      .map((permission) => permission.permission.code);

    const effectivePermissions = new Set([
      ...groupPermissions,
      ...allowDirectPermissions,
    ]);

    for (const deniedPermission of denyDirectPermissions) {
      effectivePermissions.delete(deniedPermission);
    }

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        device: data.device ?? null,
        isOnline: false,
        revoked: false,
        lastLogin: new Date(),
        lastSeen: new Date(),
      },
    });

    const payload = {
      sub: user.id,
      sid: session.id,
      email: user.email,
      permissions: [...effectivePermissions],
    };

    return {
      access_token: this.jwtService.sign(payload),
      session_id: session.id,
    };
  }

  async logout(userId: number, sessionId: string) {
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revoked: false,
      },
      data: {
        revoked: true,
        isOnline: false,
        lastSeen: new Date(),
      },
    });

    this.realtime.emitToUser(userId, 'session_invalidated', {
      userId,
      sessionId,
      reason: 'logout',
    });

    await this.realtime.disconnectSession(sessionId);

    return { success: true };
  }

  async logoutAll(userId: number) {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revoked: false,
      },
      data: {
        revoked: true,
        isOnline: false,
        lastSeen: new Date(),
      },
    });

    this.realtime.emitToUser(userId, 'session_invalidated', {
      userId,
      reason: 'logout_all',
    });

    await this.realtime.disconnectUserSessions(userId);

    return { success: true };
  }

  async getUserSessions(userId: number) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        device: true,
        isOnline: true,
        revoked: true,
        lastLogin: true,
        lastSeen: true,
        createdAt: true,
      },
    });
  }
}
