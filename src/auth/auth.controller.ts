import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Request } from 'express';

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
}
