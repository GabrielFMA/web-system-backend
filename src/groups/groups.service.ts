import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';

@Injectable()
export class GroupsService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateGroupDto) {
    return this.prisma.$transaction(async (prisma) => {

      const group = await prisma.group.create({
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
            groupId: group.id,
            permissionId: permission.id,
          })),
        });
      }

      return group;
    });
  }

  async findAll() {
    return this.prisma.group.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }
}