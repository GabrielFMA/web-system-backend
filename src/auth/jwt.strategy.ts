import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
<<<<<<< HEAD
import { PermissionEffect } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

type JwtPayload = {
  sub?: number;
  sid?: string;
  email?: string;
};
=======
import { ExtractJwt, JwtFromRequestFunction, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
  permissions: string[];
}
>>>>>>> 0ff9995aabce9ecb04b60bcbc38d06c8db9845bf

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken() as JwtFromRequestFunction,
      ignoreExpiration: false,
      secretOrKey: 'SUPER_SECRET_KEY',
    });
  }

<<<<<<< HEAD
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

=======
  validate(payload: JwtPayload) {
>>>>>>> 0ff9995aabce9ecb04b60bcbc38d06c8db9845bf
    return {
      userId: user.id,
      email: payload.email,
      sessionId: payload.sid,
      permissions: [...effectivePermissions],
    };
  }
}
