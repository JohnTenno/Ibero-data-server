export interface JwtPayload {
  sub: string;
  email: string;
  isSysadmin: boolean;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  isSysadmin: boolean;
}
