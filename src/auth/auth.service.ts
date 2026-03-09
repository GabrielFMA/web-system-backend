import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { PermissionEffect, SessionRetentionMode } from '@prisma/client';
import { RealtimeGateway } from 'src/realtime/realtime.gateway';
import { UpdateSessionPolicyDto } from './dto/update-session-policy.dto';
import { UpdateUserSessionPolicyDto } from './dto/update-user-session-policy.dto';
import { ChangePasswordSimpleDto } from './dto/change-password-simple.dto';

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private inactiveCleanupTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleInit() {
    this.inactiveCleanupTimer = setInterval(() => {
      this.revokeInactiveSessions().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to cleanup inactive sessions: ${message}`);
      });
    }, 60_000);
  }

  onModuleDestroy() {
    if (!this.inactiveCleanupTimer) return;
    clearInterval(this.inactiveCleanupTimer);
    this.inactiveCleanupTimer = undefined;
  }

  async login(data: LoginDto) {
    const { email, password } = data;

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        meta: true,
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

    if (user.meta?.invisible) {
      throw new ForbiddenException('USER_INVISIBLE');
    }

    if (user.meta?.blocked) {
      throw new ForbiddenException('USER_BLOCKED');
    }

    const policy = await this.resolveSessionPolicy(user.id);
    await this.enforceSessionLimit(user.id, policy, null);

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
        isOnline: true,
        revoked: false,
        lastLogin: new Date(),
        lastSeen: new Date(),
      },
    });

    await this.enforceSessionLimit(user.id, policy, session.id);

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
      orderBy: [{ lastLogin: 'desc' }, { lastSeen: 'desc' }],
      select: {
        id: true,
        device: true,
        isOnline: true,
        revoked: true,
        lastLogin: true,
        lastSeen: true,
      },
    });
  }

  async getUserSessionsByEnrollment(enrollment: string) {
    const user = await this.prisma.user.findUnique({
      where: { enrollment },
      select: {
        id: true,
        uid: true,
        enrollment: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const sessions = await this.getUserSessions(user.id);
    return {
      userUid: user.uid,
      userEnrollment: user.enrollment,
      sessions,
    };
  }

  async heartbeat(userId: number, sessionId: string) {
    const updated = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revoked: false,
      },
      data: {
        isOnline: true,
        lastSeen: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new UnauthorizedException('Session is invalid or revoked');
    }

    return { success: true };
  }

  async getSessionPolicy() {
    const config = await this.getOrCreateSystemConfig();
    return {
      maxSessionsGlobal: config.maxSessionsGlobal,
      sessionRetentionMode: config.sessionRetentionMode,
      idleTimeoutMinutes: config.idleTimeoutMinutes,
    };
  }

  async updateSessionPolicy(data: UpdateSessionPolicyDto) {
    const config = await this.prisma.systemConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        maxSessionsGlobal: data.maxSessionsGlobal ?? 0,
        sessionRetentionMode: data.sessionRetentionMode ?? SessionRetentionMode.REVOKE,
        idleTimeoutMinutes: data.idleTimeoutMinutes ?? 30,
      },
      update: {
        ...(data.maxSessionsGlobal !== undefined
          ? { maxSessionsGlobal: data.maxSessionsGlobal }
          : {}),
        ...(data.sessionRetentionMode !== undefined
          ? { sessionRetentionMode: data.sessionRetentionMode }
          : {}),
        ...(data.idleTimeoutMinutes !== undefined
          ? { idleTimeoutMinutes: data.idleTimeoutMinutes }
          : {}),
      },
    });

    return {
      maxSessionsGlobal: config.maxSessionsGlobal,
      sessionRetentionMode: config.sessionRetentionMode,
      idleTimeoutMinutes: config.idleTimeoutMinutes,
    };
  }

  async getUserSessionPolicy(enrollment: string) {
    const user = await this.prisma.user.findUnique({
      where: { enrollment },
      include: { meta: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const global = await this.getOrCreateSystemConfig();
    const effective = await this.resolveSessionPolicy(user.id);

    return {
      userEnrollment: user.enrollment,
      userUid: user.uid,
      maxSessions: user.meta?.maxSessions ?? null,
      sessionRetentionMode: user.meta?.sessionRetentionMode ?? null,
      effectiveMaxSessions: effective.maxSessions,
      effectiveRetentionMode: effective.retentionMode,
      global: {
        maxSessionsGlobal: global.maxSessionsGlobal,
        sessionRetentionMode: global.sessionRetentionMode,
      },
    };
  }

  async updateUserSessionPolicy(
    enrollment: string,
    data: UpdateUserSessionPolicyDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { enrollment },
      select: { id: true, uid: true, enrollment: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.userMeta.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        maxSessions: data.maxSessions ?? null,
        sessionRetentionMode: data.sessionRetentionMode ?? null,
      },
      update: {
        ...(data.maxSessions !== undefined ? { maxSessions: data.maxSessions } : {}),
        ...(data.sessionRetentionMode !== undefined
          ? { sessionRetentionMode: data.sessionRetentionMode }
          : {}),
      },
    });

    const policy = await this.resolveSessionPolicy(user.id);
    await this.enforceSessionLimit(user.id, policy, null);

    return this.getUserSessionPolicy(user.enrollment);
  }

  async changePasswordSimple(data: ChangePasswordSimpleDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true, uid: true, enrollment: true, password: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(data.password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const hashedNewPassword = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.$transaction(async (prisma) => {
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedNewPassword },
      });

      await prisma.session.updateMany({
        where: {
          userId: user.id,
          revoked: false,
        },
        data: {
          revoked: true,
          isOnline: false,
          lastSeen: new Date(),
        },
      });
    });

    this.realtime.emitToUser(user.id, 'session_invalidated', {
      userUid: user.uid,
      userEnrollment: user.enrollment,
      reason: 'password_changed',
    });

    await this.realtime.disconnectUserSessions(user.id);

    return { success: true };
  }

  private async revokeInactiveSessions() {
    const config = await this.getOrCreateSystemConfig();
    if (config.idleTimeoutMinutes <= 0) {
      return;
    }

    const threshold = new Date(
      Date.now() - config.idleTimeoutMinutes * 60 * 1000,
    );

    const inactiveSessions = await this.prisma.session.findMany({
      where: {
        revoked: false,
        OR: [
          { lastSeen: { lt: threshold } },
          {
            AND: [
              { lastSeen: null },
              { lastLogin: { lt: threshold } },
            ],
          },
          {
            AND: [{ lastSeen: null }, { lastLogin: null }, { createdAt: { lt: threshold } }],
          },
        ],
      },
      include: {
        user: {
          include: {
            meta: true,
          },
        },
      },
    });

    for (const session of inactiveSessions) {
      const policy = await this.resolveSessionPolicy(session.userId, session.user.meta);

      await this.closeSessions([session.id], policy.retentionMode);
      this.realtime.emitToUser(session.userId, 'session_invalidated', {
        userUid: session.user.uid,
        userEnrollment: session.user.enrollment,
        sessionId: session.id,
        reason: 'idle_timeout',
      });
    }
  }

  private async enforceSessionLimit(
    userId: number,
    policy: {
      maxSessions: number;
      retentionMode: SessionRetentionMode;
    },
    keepSessionId: string | null,
  ) {
    if (policy.maxSessions === 0) {
      return;
    }

    const activeSessions = await this.prisma.session.findMany({
      where: {
        userId,
        revoked: false,
      },
      select: {
        id: true,
      },
      orderBy: [{ lastLogin: 'asc' }, { createdAt: 'asc' }],
    });

    const excessCount = activeSessions.length - policy.maxSessions;
    if (excessCount <= 0) {
      return;
    }

    const removableSessionIds = activeSessions
      .map((session) => session.id)
      .filter((sessionId) => sessionId !== keepSessionId)
      .slice(0, excessCount);

    if (removableSessionIds.length === 0) {
      return;
    }

    await this.closeSessions(removableSessionIds, policy.retentionMode);

    for (const sessionId of removableSessionIds) {
      this.realtime.emitToUser(userId, 'session_invalidated', {
        userId,
        sessionId,
        reason: 'session_limit',
      });
    }
  }

  private async closeSessions(
    sessionIds: string[],
    retentionMode: SessionRetentionMode,
  ) {
    if (sessionIds.length === 0) return;

    if (retentionMode === SessionRetentionMode.DELETE) {
      await this.prisma.session.deleteMany({
        where: { id: { in: sessionIds } },
      });
    } else {
      await this.prisma.session.updateMany({
        where: { id: { in: sessionIds } },
        data: {
          revoked: true,
          isOnline: false,
          lastSeen: new Date(),
        },
      });
    }

    for (const sessionId of sessionIds) {
      await this.realtime.disconnectSession(sessionId);
    }
  }

  private async getOrCreateSystemConfig() {
    return this.prisma.systemConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        maxSessionsGlobal: 0,
        sessionRetentionMode: SessionRetentionMode.REVOKE,
        idleTimeoutMinutes: 30,
      },
      update: {},
    });
  }

  private async resolveSessionPolicy(
    userId: number,
    existingMeta?: { maxSessions: number | null; sessionRetentionMode: SessionRetentionMode | null } | null,
  ) {
    const [config, meta] = await Promise.all([
      this.getOrCreateSystemConfig(),
      existingMeta !== undefined
        ? Promise.resolve(existingMeta)
        : this.prisma.userMeta.findUnique({
            where: { userId },
            select: {
              maxSessions: true,
              sessionRetentionMode: true,
            },
          }),
    ]);

    return {
      maxSessions: Math.max(0, meta?.maxSessions ?? config.maxSessionsGlobal ?? 0),
      retentionMode: meta?.sessionRetentionMode ?? config.sessionRetentionMode,
    };
  }
}
