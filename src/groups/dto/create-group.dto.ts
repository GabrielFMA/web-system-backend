import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  enrollment!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionCodes?: string[];
}
