import { startServer } from '../../../src/api/server';

startServer().then(
  () => process.exit(2),
  (error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exit(0);
  },
);
