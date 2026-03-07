import { IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
<<<<<<< HEAD

  @IsOptional()
  @IsString()
  device?: string;
=======
>>>>>>> 0ff9995aabce9ecb04b60bcbc38d06c8db9845bf
}
