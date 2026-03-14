import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const createTempDirectory = async (prefix: string): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), `${prefix}-`));
};

export const removeTempDirectory = async (directory: string): Promise<void> => {
  await rm(directory, { recursive: true, force: true });
};
