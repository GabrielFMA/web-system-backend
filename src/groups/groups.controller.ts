import { Controller, Post, Get, Body, Patch, Param } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

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
<<<<<<< HEAD

  @Patch(':enrollment')
  update(@Param('enrollment') enrollment: string, @Body() body: UpdateGroupDto) {
    return this.groupsService.update(enrollment, body);
  }
=======
>>>>>>> 0ff9995aabce9ecb04b60bcbc38d06c8db9845bf
}
