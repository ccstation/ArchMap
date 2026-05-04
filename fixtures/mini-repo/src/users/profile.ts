import { token } from "../auth/internal/token";

export function profile(): string {
  return token();
}
