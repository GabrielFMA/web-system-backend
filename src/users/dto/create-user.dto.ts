import { IsEmail, IsString, MinLength, IsOptional, IsArray } from 'class-validator'

export class CreateUserDto {

  @IsString()
  enrollment!: string;

  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  groupEnrollments?: string[];

  @IsOptional()
  @IsArray()
  permissionCodes?: string[];
}