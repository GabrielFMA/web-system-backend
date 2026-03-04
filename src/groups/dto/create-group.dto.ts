export class CreateGroupDto {
  code: string;           // "admin"
  title: string;          // "Administrador"
  description?: string;
  permissionCodes?: string[]; // ["010001", "010002"]
}