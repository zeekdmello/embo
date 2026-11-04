import { createSampleData } from '@shared/data/seed';
import { defaultMonth } from '@shared/engine/roster';
import { createApp } from './app';
import { config } from './config';
import { connectDb } from './db';
import { Employee } from './models';
import { replaceDataset } from './services/dataset';

async function main() {
  await connectDb();

  // First run on an empty database: load the sample data so the app works immediately.
  if (config.seedOnEmpty && (await Employee.estimatedDocumentCount()) === 0) {
    const month = defaultMonth();
    await replaceDataset(createSampleData(month));
    console.log(`[db] empty database — loaded sample data (leave scenarios placed in ${month})`);
  }

  const app = createApp();
  app.listen(config.port, () => console.log(`[api] Embo server listening on http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error('[api] failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
