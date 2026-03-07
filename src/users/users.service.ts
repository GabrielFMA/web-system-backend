import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionEffect, Prisma } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { RealtimeGateway } from 'src/realtime/realtime.gateway';
import { UpdateUserDto } from './dto/update-user.dto';

type PublicUser = {
  uid: string;
  enrollment: string;
  name: string;
  email: string;
  phone: string | null;
  description: string | null;
  createdAt: Date | null;
  meta: {
    blocked: boolean;
    invisible: boolean;
    invisibleAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };
  groupEnrollments: string[];
  groups: Array<{
    enrollment: string;
    title: string;
    description: string | null;
  }>;
  permissions: string[];
  groupPermissions: string[];
  session: {
    blocked: boolean;
    isOnline: boolean;
    device: string | null;
    lastLogin: Date | null;
    lastSeen: Date | null;
  };
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(data: CreateUserDto) {
    return this.prisma.$transaction(async (prisma) => {
      const normalizedGroups = this.normalizeGroupEnrollments(data);
      const normalizedPermissions = this.normalizePermissionCodes(data);
      const hashedPassword = await bcrypt.hash(data.password, 10);

      const createdUser = await prisma.user.create({
        data: {
          uid: randomUUID(),
          password: hashedPassword,
          name: data.name,
          email: data.email,
          phone: data.phone,
          description: data.description,
          enrollment: data.enrollment,
          meta: {
            create: {},
          },
        },
      });

      if (normalizedGroups.length > 0) {
        const groups = await prisma.group.findMany({
          where: { enrollment: { in: normalizedGroups } },
        });

        await prisma.userGroup.createMany({
          data: groups.map((group) => ({
            userId: createdUser.id,
            groupId: group.id,
          })),
        });
      }

      if (normalizedPermissions.length > 0) {
        const permissions = await prisma.permission.findMany({
          where: { code: { in: normalizedPermissions } },
        });

        await prisma.userPermission.createMany({
          data: permissions.map((permission) => ({
            userId: createdUser.id,
            permissionId: permission.id,
            effect: PermissionEffect.ALLOW,
          })),
        });
      }

      const user = await this.findPublicById(prisma, createdUser.id);
      this.realtime.emit('user_created', user);

      return user;
    });
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: this.publicUserInclude(),
    });

    return users.map((user) => this.toPublicUser(user));
  }

  async findOne(enrollment: string) {
    const user = await this.prisma.user.findUnique({
      where: { enrollment },
      include: this.publicUserInclude(),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toPublicUser(user);
  }

  async update(enrollment: string, data: UpdateUserDto) {
    return this.prisma.$transaction(async (prisma) => {
      const normalizedGroups = this.normalizeGroupEnrollments(data);
      const normalizedPermissions = this.normalizePermissionCodes(data);
      const shouldUpdateGroups =
        data.groupEnrollments !== undefined || data.groups !== undefined;
      const shouldUpdatePermissions =
        data.permissionCodes !== undefined || data.permissions !== undefined;

      const targetUser = await prisma.user.findUnique({
        where: { enrollment },
        select: {
          id: true,
          uid: true,
          enrollment: true,
        },
      });

      if (!targetUser) {
        throw new NotFoundException('User not found');
      }

      const rawPassword = data.password;
      const isPasswordChanged = typeof rawPassword === 'string';
      const isPermissionStateChanged = shouldUpdateGroups || shouldUpdatePermissions;

      const updateData: {
        enrollment?: string;
        name?: string;
        email?: string;
        password?: string;
        phone?: string;
        description?: string;
      } = {};

      if (data.enrollment !== undefined) updateData.enrollment = data.enrollment;
      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.description !== undefined) updateData.description = data.description;
      if (isPasswordChanged) {
        updateData.password = await bcrypt.hash(rawPassword, 10);
      }

      await prisma.user.update({
        where: { id: targetUser.id },
        data: updateData,
      });

      if (shouldUpdateGroups) {
        const groups = await prisma.group.findMany({
          where: { enrollment: { in: normalizedGroups } },
        });

        await prisma.userGroup.deleteMany({
          where: { userId: targetUser.id },
        });

        if (groups.length > 0) {
          await prisma.userGroup.createMany({
            data: groups.map((group) => ({
              userId: targetUser.id,
              groupId: group.id,
            })),
          });
        }
      }

      if (shouldUpdatePermissions) {
        const permissions = await prisma.permission.findMany({
          where: { code: { in: normalizedPermissions } },
        });

        await prisma.userPermission.deleteMany({
          where: { userId: targetUser.id },
        });

        if (permissions.length > 0) {
          await prisma.userPermission.createMany({
            data: permissions.map((permission) => ({
              userId: targetUser.id,
              permissionId: permission.id,
              effect: PermissionEffect.ALLOW,
            })),
          });
        }
      }

      if (isPasswordChanged) {
        await prisma.session.updateMany({
          where: {
            userId: targetUser.id,
            revoked: false,
          },
          data: {
            revoked: true,
            isOnline: false,
            lastSeen: new Date(),
          },
        });

        this.realtime.emitToUser(targetUser.id, 'session_invalidated', {
          userUid: targetUser.uid,
          userEnrollment: targetUser.enrollment,
          reason: 'password_changed',
        });

        await this.realtime.disconnectUserSessions(targetUser.id);
      }

      if (isPermissionStateChanged) {
        const effectivePermissions = await this.computeEffectivePermissions(
          prisma,
          targetUser.id,
        );

        this.realtime.emitToUser(targetUser.id, 'permissions_updated', {
          userUid: targetUser.uid,
          userEnrollment: targetUser.enrollment,
          permissions: effectivePermissions,
        });

        await prisma.session.updateMany({
          where: {
            userId: targetUser.id,
            revoked: false,
          },
          data: {
            revoked: true,
            isOnline: false,
            lastSeen: new Date(),
          },
        });

        this.realtime.emitToUser(targetUser.id, 'session_invalidated', {
          userUid: targetUser.uid,
          userEnrollment: targetUser.enrollment,
          reason: 'permissions_changed',
        });

        await this.realtime.disconnectUserSessions(targetUser.id);
      }

      const user = await this.findPublicById(prisma, targetUser.id);
      this.realtime.emit('user_updated', user);

      return user;
    });
  }

  async getEffectivePermissions(enrollment: string) {
    const user = await this.prisma.user.findUnique({
      where: { enrollment },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.computeEffectivePermissions(this.prisma, user.id);
  }

  private async findPublicById(
    prisma: PrismaService | Prisma.TransactionClient,
    userId: number,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: this.publicUserInclude(),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toPublicUser(user);
  }

  private publicUserInclude() {
    return {
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
      permissions: {
        include: {
          permission: true,
        },
      },
      sessions: {
        orderBy: { createdAt: 'desc' as const },
      },
      meta: true,
    };
  }

  private toPublicUser(user: any): PublicUser {
    const directAllowedPermissions = user.permissions
      .filter((permission: any) => permission.effect === PermissionEffect.ALLOW)
      .map((permission: any) => permission.permission.code);

    const directDeniedPermissions = user.permissions
      .filter((permission: any) => permission.effect === PermissionEffect.DENY)
      .map((permission: any) => permission.permission.code);

    const groupPermissions: string[] = user.groups.flatMap((groupLink: any) =>
      groupLink.group.permissions.map(
        (permissionLink: any) => permissionLink.permission.code as string,
      ),
    );

    const directPermissions = new Set<string>(directAllowedPermissions);
    for (const deniedPermission of directDeniedPermissions) {
      directPermissions.delete(deniedPermission);
    }

    const activeSessions = user.sessions.filter((session: any) => !session.revoked);
    const latestSession =
      user.sessions.find((session: any) => !!session.lastSeen) ??
      user.sessions.find((session: any) => !!session.lastLogin) ??
      user.sessions[0] ??
      null;

    return {
      uid: user.uid,
      enrollment: user.enrollment,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      description: user.description ?? null,
      createdAt:
        user.meta?.createdAt ??
        latestSession?.createdAt ??
        null,
      meta: {
        blocked: !!user.meta?.blocked,
        invisible: !!user.meta?.invisible,
        invisibleAt: user.meta?.invisibleAt ?? null,
        createdAt: user.meta?.createdAt ?? null,
        updatedAt: user.meta?.updatedAt ?? null,
      },
      groupEnrollments: user.groups.map((groupLink: any) => groupLink.group.enrollment),
      groups: user.groups.map((groupLink: any) => ({
        enrollment: groupLink.group.enrollment,
        title: groupLink.group.title,
        description: groupLink.group.description ?? null,
      })),
      permissions: [...directPermissions],
      groupPermissions: [...new Set(groupPermissions)],
      session: {
        blocked: !!user.meta?.blocked,
        isOnline: activeSessions.some((session: any) => session.isOnline),
        device: latestSession?.device ?? null,
        lastLogin: latestSession?.lastLogin ?? null,
        lastSeen: latestSession?.lastSeen ?? null,
      },
    };
  }

  private async computeEffectivePermissions(
    prisma: PrismaService | Prisma.TransactionClient,
    userId: number,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
      throw new NotFoundException('User not found');
    }

    const allowDirectPermissions = user.permissions
      .filter((permission) => permission.effect === PermissionEffect.ALLOW)
      .map((permission) => permission.permission.code);

    const denyDirectPermissions = user.permissions
      .filter((permission) => permission.effect === PermissionEffect.DENY)
      .map((permission) => permission.permission.code);

    const groupPermissions = user.groups.flatMap((group) =>
      group.group.permissions.map((permission) => permission.permission.code),
    );

    const effectivePermissions = new Set([
      ...groupPermissions,
      ...allowDirectPermissions,
    ]);

    for (const deniedPermission of denyDirectPermissions) {
      effectivePermissions.delete(deniedPermission);
    }

    return [...effectivePermissions];
  }

  private normalizeGroupEnrollments(data: {
    groupEnrollments?: string[];
    groups?: string[];
  }): string[] {
    const source = data.groupEnrollments ?? data.groups ?? [];
    if (!Array.isArray(source)) {
      return [];
    }

    return [...new Set(source.filter((value): value is string => typeof value === 'string'))];
  }

  private normalizePermissionCodes(data: {
    permissionCodes?: string[];
    permissions?: string[];
  }): string[] {
    const source = data.permissionCodes ?? data.permissions ?? [];
    if (!Array.isArray(source)) {
      return [];
    }

    return [...new Set(source.filter((value): value is string => typeof value === 'string'))];
  }
}
