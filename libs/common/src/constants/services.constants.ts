export const SERVICES = {
  API_GATEWAY: 'api-gateway',
  AUTH_SERVICE: 'auth-service',
  USER_SERVICE: 'user-service',
} as const;

export const SERVICES_PORTS = {
  API_GATEWAY: 3000,
  AUTH_SERVICE: 3001,
  USER_SERVICE: 3002,
} as const;
