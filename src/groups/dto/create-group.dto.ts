import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateGroupDto {
<<<<<<< HEAD
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
=======
  enrollment: string; // "admin"
  title: string; // "Administrador"
  description?: string;
  permissionCodes?: string[]; // ["010001", "010002"]
>>>>>>> 0ff9995aabce9ecb04b60bcbc38d06c8db9845bf
}
