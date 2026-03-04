import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async create(data: CreateUserDto) {
    return this.prisma.$transaction(async (prisma) => {

      const user = await prisma.user.create({
        data: {
          uid: data.uid,
          name: data.name,
          email: data.email,
          phone: data.phone,
          description: data.description,
          enrollment: data.enrollment,
        },
      });

      if (data.groupCodes?.length) {
        const groups = await prisma.group.findMany({
          where: { code: { in: data.groupCodes } },
        });

        await prisma.userGroup.createMany({
          data: groups.map((group) => ({
            userId: user.id,
            groupId: group.id,
          })),
        });
      }

      if (data.permissionCodes?.length) {
        const permissions = await prisma.permission.findMany({
          where: { code: { in: data.permissionCodes } },
        });

        await prisma.userPermission.createMany({
          data: permissions.map((permission) => ({
            userId: user.id,
            permissionId: permission.id,
          })),
        });
      }

      return user;
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      include: {
        groups: {
          include: {
            group: true,
          },
        },
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async getEffectivePermissions(userId: number) {
    const user = await this.prisma.user.findUnique({
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
      throw new Error('User not found');
    }

    const directPermissions = user.permissions.map(
      (up) => up.permission.code,
    );

    const groupPermissions = user.groups.flatMap((ug) =>
      ug.group.permissions.map((gp) => gp.permission.code),
    );

    const allPermissions = [...directPermissions, ...groupPermissions];

    return [...new Set(allPermissions)];
  }
}