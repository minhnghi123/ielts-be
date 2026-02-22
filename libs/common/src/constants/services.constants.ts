export const SERVICES = {
  API_GATEWAY: 'api-gateway',
  AUTH_SERVICE: 'auth-service',
  TEST_SERVICE: 'test-service',
  SUBMISSION_SERVICE: 'submission-service',
  ANALYTICS_SERVICE: 'analytics-service',
} as const;

export const SERVICES_PORTS = {
  API_GATEWAY: 5000,
  AUTH_SERVICE: 5001,
  TEST_SERVICE: 5002,
  SUBMISSION_SERVICE: 5003,
  ANALYTICS_SERVICE: 5004,
} as const;
