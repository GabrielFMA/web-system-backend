import {
  Controller,
  Post,
  Body,
  UseGuards,
  Param,
  Get,
  Patch,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';

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
  @Get(':enrollment/permissions')
  getPermissions(@Param('enrollment') enrollment: string) {
    return this.usersService.getEffectivePermissions(enrollment);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('010001')
  @Get(':enrollment')
  findOne(@Param('enrollment') enrollment: string) {
    return this.usersService.findOne(enrollment);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('010001')
  @Patch(':enrollment')
  update(
    @Param('enrollment') enrollment: string,
    @Body() body: UpdateUserDto,
  ) {
    return this.usersService.update(enrollment, body);
  }
}
