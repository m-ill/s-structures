import { migrateLegacyState } from '../server/store/stateMigration.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));

const result = await migrateLegacyState({
  sourceDataDir: args.source,
  targetDataDir: args.data,
  targetSecretsDir: args.secrets,
  dryRun: args['dry-run'] === true || args['dry-run'] === 'true',
  rotateSecret: args['rotate-secret'] === true || args['rotate-secret'] === 'true',
});
console.log(JSON.stringify(result, null, 2));

