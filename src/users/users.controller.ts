import { Controller, Post, Body, UseGuards, Param, ParseIntPipe, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('010001')
  @Post()
  create(@Body() body: CreateUserDto) {
    return this.usersService.create(body);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('010001')
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('010001')
  @Get(':id/permissions')
  getPermissions(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getEffectivePermissions(id);
  }
}