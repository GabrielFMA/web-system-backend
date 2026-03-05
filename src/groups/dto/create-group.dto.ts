export class CreateGroupDto {
  enrollment: string;           // "admin"
  title: string;          // "Administrador"
  description?: string;
  permissionCodes?: string[]; // ["010001", "010002"]
}