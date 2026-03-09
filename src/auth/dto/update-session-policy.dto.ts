import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { SessionRetentionMode } from '@prisma/client';

export class UpdateSessionPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxSessionsGlobal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idleTimeoutMinutes?: number;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(SessionRetentionMode)
  sessionRetentionMode?: SessionRetentionMode;
}
