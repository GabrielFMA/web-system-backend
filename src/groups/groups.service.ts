import { Injectable, NotFoundException } from '@nestjs/common';
import { PermissionEffect, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { RealtimeGateway } from 'src/realtime/realtime.gateway';

type PublicGroup = {
  enrollment: string;
  title: string;
  description: string | null;
  permissions: string[];
};

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(data: CreateGroupDto) {
    return this.prisma.$transaction(async (prisma) => {
      const createdGroup = await prisma.group.create({
        data: {
          enrollment: data.enrollment,
          title: data.title,
          description: data.description,
        },
      });

      if (data.permissionCodes?.length) {
        const permissions = await prisma.permission.findMany({
          where: { code: { in: data.permissionCodes } },
        });

        await prisma.groupPermission.createMany({
          data: permissions.map((permission) => ({
            groupId: createdGroup.id,
            permissionId: permission.id,
          })),
        });
      }

      const group = await this.findPublicById(prisma, createdGroup.id);
      this.realtime.emit('group_created', group);

      return group;
    });
  }

  async findAll() {
    const groups = await this.prisma.group.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return groups.map((group) => this.toPublicGroup(group));
  }

  async update(enrollment: string, data: UpdateGroupDto) {
    return this.prisma.$transaction(async (prisma) => {
      const targetGroup = await prisma.group.findUnique({
        where: { enrollment },
        select: { id: true, enrollment: true },
      });

      if (!targetGroup) {
        throw new NotFoundException('Group not found');
      }

      const updateData: {
        enrollment?: string;
        title?: string;
        description?: string;
      } = {};

      if (data.enrollment !== undefined) updateData.enrollment = data.enrollment;
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;

      await prisma.group.update({
        where: { id: targetGroup.id },
        data: updateData,
      });

      if (data.permissionCodes !== undefined) {
        const affectedUsers = await prisma.userGroup.findMany({
          where: { groupId: targetGroup.id },
          select: { userId: true },
        });

        const permissions = await prisma.permission.findMany({
          where: { code: { in: data.permissionCodes } },
        });

        await prisma.groupPermission.deleteMany({
          where: { groupId: targetGroup.id },
        });

        if (permissions.length > 0) {
          await prisma.groupPermission.createMany({
            data: permissions.map((permission) => ({
              groupId: targetGroup.id,
              permissionId: permission.id,
            })),
          });
        }

        const userIds = [...new Set(affectedUsers.map((user) => user.userId))];

        if (userIds.length > 0) {
          const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, uid: true, enrollment: true },
          });

          await prisma.session.updateMany({
            where: {
              userId: { in: userIds },
              revoked: false,
            },
            data: {
              revoked: true,
              isOnline: false,
              lastSeen: new Date(),
            },
          });

          for (const user of users) {
            const effectivePermissions = await this.computeEffectivePermissions(
              prisma,
              user.id,
            );

            this.realtime.emitToUser(user.id, 'permissions_updated', {
              userUid: user.uid,
              userEnrollment: user.enrollment,
              permissions: effectivePermissions,
            });

            this.realtime.emitToUser(user.id, 'session_invalidated', {
              userUid: user.uid,
              userEnrollment: user.enrollment,
              reason: 'group_permissions_changed',
            });

            await this.realtime.disconnectUserSessions(user.id);
          }
        }
      }

      const group = await this.findPublicById(prisma, targetGroup.id);
      this.realtime.emit('group_updated', group);

      return group;
    });
  }

  private async findPublicById(
    prisma: PrismaService | Prisma.TransactionClient,
    groupId: number,
  ) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return this.toPublicGroup(group);
  }

  private toPublicGroup(group: any): PublicGroup {
    return {
      enrollment: group.enrollment,
      title: group.title,
      description: group.description ?? null,
      permissions: group.permissions.map((permissionLink: any) => permissionLink.permission.code),
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
      return [];
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
}
