import mongoose from 'mongoose';
import { config } from './config';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  const { host, name } = mongoose.connection;
  console.log(`[db] connected to ${host}/${name}`);
}

export function dbState(): string {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ?? 'unknown';
}
