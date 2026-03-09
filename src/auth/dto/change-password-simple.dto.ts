import { IsEmail, IsString, MinLength } from 'class-validator';

export class ChangePasswordSimpleDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

