import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import { SessionRetentionMode } from '@prisma/client';

export class UpdateUserSessionPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  maxSessions?: number | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;
    return typeof value === 'string' ? value.toUpperCase() : value;
  })
  @ValidateIf((_, value) => value !== null)
  @IsEnum(SessionRetentionMode)
  sessionRetentionMode?: SessionRetentionMode | null;
}
