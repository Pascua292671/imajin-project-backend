export type UserRole = 
|"artist"
| "sessionist" 
| "organizer" 
| "customer";

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
}