// Mock module for agent-gateway: src/api/user.ts
// Intentionally minimal so Guardian's pii constraints fire.

export type UserProfile = {
  id: number;          // sequential — violates pii rule 5
  email: string;
  fullName: string;
  phone: string;
};

export function userPath(profile: UserProfile): string {
  // /user/12345/profile — sequential identifier in the URL
  return `/user/${profile.id}/profile`;
}
