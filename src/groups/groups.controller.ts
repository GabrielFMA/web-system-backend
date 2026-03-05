import { Controller, Post, Get, Body } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  create(@Body() body: CreateGroupDto) {
    return this.groupsService.create(body);
  }

  @Get()
  findAll() {
    return this.groupsService.findAll();
  }
}
