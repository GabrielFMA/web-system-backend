import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { PermissionEffect } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

type JwtPayload = {
  sub?: number;
  sid?: string;
  email?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'SUPER_SECRET_KEY',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid token');
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revoked: false,
      },
    });

    if (!session) {
      throw new UnauthorizedException('Session is invalid or revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
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
      throw new UnauthorizedException('User not found');
    }

    if (user.meta?.blocked || user.meta?.invisible) {
      await this.prisma.session.updateMany({
        where: {
          id: payload.sid,
          userId: payload.sub,
          revoked: false,
        },
        data: {
          revoked: true,
          isOnline: false,
          lastSeen: new Date(),
        },
      });
      throw new UnauthorizedException('User is blocked');
    }

    const allowedDirectPermissions = user.permissions
      .filter((permission) => permission.effect === PermissionEffect.ALLOW)
      .map((permission) => permission.permission.code);

    const deniedDirectPermissions = user.permissions
      .filter((permission) => permission.effect === PermissionEffect.DENY)
      .map((permission) => permission.permission.code);

    const groupPermissions = user.groups.flatMap((group) =>
      group.group.permissions.map((permission) => permission.permission.code),
    );

    const effectivePermissions = new Set([
      ...groupPermissions,
      ...allowedDirectPermissions,
    ]);

    for (const deniedPermission of deniedDirectPermissions) {
      effectivePermissions.delete(deniedPermission);
    }
    return {
      userId: user.id,
      email: payload.email,
      sessionId: payload.sid,
      permissions: [...effectivePermissions],
    };
  }
}
