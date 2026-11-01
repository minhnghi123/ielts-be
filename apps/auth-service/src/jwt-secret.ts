export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET must be set — refusing to start with a default signing key',
    );
  }
  return secret;
}
