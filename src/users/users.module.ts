import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { RealtimeModule } from 'src/realtime/realtime.module';

@Module({
  imports: [PrismaModule, RealtimeModule],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
