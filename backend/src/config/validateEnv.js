/**
 * Validate required environment variables at startup.
 *
 * Runs after loadEnv has resolved MONGODB_URI from the state-specific
 * key. Reports every missing variable in one pass (so operators don't
 * have to restart the server to discover issues one at a time), prints
 * guidance on where to set them, and exits with code 1 on failure.
 */

const REQUIRED = [
  {
    key: 'MONGODB_URI',
    description: 'MongoDB connection string (set explicitly in .env, or via <STATE>_MONGODB_URI matching APP_STATE)',
  },
  {
    key: 'ADMIN_PASSWORD',
    description: 'password for the admin dashboard login (POST /api/admin/login)',
  },
];

function validateEnv() {
  const missing = REQUIRED.filter(({ key }) => !process.env[key]);
  if (missing.length === 0) return;

  const state = (process.env.APP_STATE || '<unset>').toLowerCase();
  const lines = [
    '',
    '[env] Startup validation failed — missing required environment variable(s):',
    '',
  ];
  for (const { key, description } of missing) {
    lines.push(`  - ${key}`);
    lines.push(`      ${description}`);
  }
  lines.push('');
  lines.push(`APP_STATE is "${state}". Expected MongoDB key for this state: ${state.toUpperCase()}_MONGODB_URI`);
  lines.push('');
  lines.push('Fix: set the above in backend/.env (see backend/.env.example for the full template),');
  lines.push('then restart the service.');
  lines.push('');

  console.error(lines.join('\n'));
  process.exit(1);
}

module.exports = { validateEnv };
