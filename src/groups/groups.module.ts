import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { RealtimeModule } from 'src/realtime/realtime.module';

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [GroupsController],
  providers: [GroupsService],
})
export class GroupsModule {}
