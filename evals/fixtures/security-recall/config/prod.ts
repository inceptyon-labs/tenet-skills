// Production configuration.
export const config = {
  env: 'production',
  db: {
    host: 'db.internal.prod',
    user: 'app',
    // PLANT SEC-DEFAULT-002: default/weak credentials shipped in a production config
    password: 'admin',
  },
  auth: {
    // PLANT SEC-DEFAULT-002: placeholder signing secret never rotated for prod
    secret: 'changeme',
  },
};
