import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Request } from 'express';
import { UpdateSessionPolicyDto } from './dto/update-session-policy.dto';
import { UpdateUserSessionPolicyDto } from './dto/update-user-session-policy.dto';
import { ChangePasswordSimpleDto } from './dto/change-password-simple.dto';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Permissions } from 'src/common/decorators/permissions.decorator';

type AuthenticatedRequest = Request & {
  user: {
    userId: number;
    sessionId: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('change-password-simple')
  changePasswordSimple(@Body() body: ChangePasswordSimpleDto) {
    return this.authService.changePasswordSimple(body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() request: AuthenticatedRequest) {
    return this.authService.logout(
      request.user.userId,
      request.user.sessionId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  logoutAll(@Req() request: AuthenticatedRequest) {
    return this.authService.logoutAll(request.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  sessions(@Req() request: AuthenticatedRequest) {
    return this.authService.getUserSessions(request.user.userId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('010001')
  @Get('sessions/:enrollment')
  sessionsByEnrollment(@Param('enrollment') enrollment: string) {
    return this.authService.getUserSessionsByEnrollment(enrollment);
  }

  @UseGuards(JwtAuthGuard)
  @Post('heartbeat')
  heartbeat(@Req() request: AuthenticatedRequest) {
    return this.authService.heartbeat(
      request.user.userId,
      request.user.sessionId,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('010001')
  @Get('session-policy')
  getSessionPolicy() {
    return this.authService.getSessionPolicy();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('010001')
  @Patch('session-policy')
  updateSessionPolicy(@Body() body: UpdateSessionPolicyDto) {
    return this.authService.updateSessionPolicy(body);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('010001')
  @Get('session-policy/users/:enrollment')
  getUserSessionPolicy(@Param('enrollment') enrollment: string) {
    return this.authService.getUserSessionPolicy(enrollment);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('010001')
  @Patch('session-policy/users/:enrollment')
  updateUserSessionPolicy(
    @Param('enrollment') enrollment: string,
    @Body() body: UpdateUserSessionPolicyDto,
  ) {
    return this.authService.updateUserSessionPolicy(enrollment, body);
  }
}
