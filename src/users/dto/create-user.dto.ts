export class CreateUserDto {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  description?: string;
  enrollment?: string;
  groupCodes?: string[];
  permissionCodes?: string[];
}