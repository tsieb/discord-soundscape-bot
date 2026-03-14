import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmptySoundLibraryError,
  InvalidSoundCategoryError,
  InvalidSoundFileNameError,
  SoundLibrary,
  SoundNotFoundError,
  UnsupportedSoundFormatError,
} from '../../src/services/sound-library';
import {
  createTempDirectory,
  removeTempDirectory,
} from '../helpers/temp-directory';

describe('SoundLibrary', () => {
  let tempDirectory = '';

  beforeEach(async () => {
    tempDirectory = await createTempDirectory('sound-library-test');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await removeTempDirectory(tempDirectory);
  });

  it('scans supported files recursively with category resolution', async () => {
    await mkdir(path.join(tempDirectory, 'fx'), { recursive: true });
    await writeFile(path.join(tempDirectory, 'root.mp3'), 'a');
    await writeFile(path.join(tempDirectory, 'fx', 'zap.wav'), 'b');
    await writeFile(path.join(tempDirectory, 'fx', 'ignore.txt'), 'c');

    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    expect(library.getSoundCount()).toBe(2);
    expect(library.getSounds()).toEqual([
      {
        name: 'zap',
        path: path.resolve(path.join(tempDirectory, 'fx', 'zap.wav')),
        category: 'fx',
      },
      {
        name: 'root',
        path: path.resolve(path.join(tempDirectory, 'root.mp3')),
        category: 'default',
      },
    ]);
  });

  it('throws when random sound is requested from an empty library', async () => {
    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    expect(() => library.getRandomSound()).toThrow(EmptySoundLibraryError);
  });

  it('avoids repeating the same sound back-to-back when possible', async () => {
    await writeFile(path.join(tempDirectory, 'one.mp3'), 'a');
    await writeFile(path.join(tempDirectory, 'two.mp3'), 'b');

    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99);

    const first = library.getRandomSound();
    const second = library.getRandomSound();

    expect(first.path).not.toBe(second.path);
    expect(randomSpy).toHaveBeenCalledTimes(3);
  });

  it('finds sounds by case-insensitive name', async () => {
    await writeFile(path.join(tempDirectory, 'Bell.ogg'), 'a');

    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    expect(library.getSoundByName('bell')?.name).toBe('Bell');
    expect(library.getSoundByName('BELL')?.name).toBe('Bell');
  });

  it('returns sorted unique categories', async () => {
    await mkdir(path.join(tempDirectory, 'zeta'), { recursive: true });
    await mkdir(path.join(tempDirectory, 'alpha'), { recursive: true });
    await writeFile(path.join(tempDirectory, 'zeta', 'z.mp3'), 'a');
    await writeFile(path.join(tempDirectory, 'alpha', 'a.mp3'), 'b');
    await writeFile(path.join(tempDirectory, 'root.mp3'), 'c');

    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    expect(library.getCategories()).toEqual(['alpha', 'default', 'zeta']);
  });

  it('adds sounds with sanitized category and deduplicated names', async () => {
    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    const first = await library.addSound('my sound.mp3', Buffer.from('a'), 'Fun FX');
    const second = await library.addSound('my sound.mp3', Buffer.from('b'), 'Fun FX');

    expect(first.name).toBe('my-sound');
    expect(first.category).toBe('fun-fx');
    expect(second.name).toBe('my-sound-2');
    expect(second.path).toContain('fun-fx');
    expect(library.getSoundCount()).toBe(2);
  });

  it('rejects unsupported formats when adding sounds', async () => {
    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    await expect(library.addSound('voice.txt', Buffer.from('x'))).rejects.toThrow(
      UnsupportedSoundFormatError,
    );
  });

  it('rejects invalid filenames when adding sounds', async () => {
    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    await expect(library.addSound('..', Buffer.from('x'))).rejects.toThrow(
      InvalidSoundFileNameError,
    );
  });

  it('rejects invalid categories when adding sounds', async () => {
    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    await expect(
      library.addSound('good.mp3', Buffer.from('x'), '***'),
    ).rejects.toThrow(InvalidSoundCategoryError);
  });

  it('removes sounds and rescans library state', async () => {
    await writeFile(path.join(tempDirectory, 'erase.mp3'), 'x');
    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    await library.removeSound('erase');

    await expect(stat(path.join(tempDirectory, 'erase.mp3'))).rejects.toThrow();
    expect(library.getSoundCount()).toBe(0);
  });

  it('throws when removing unknown sounds', async () => {
    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    await expect(library.removeSound('missing')).rejects.toThrow(SoundNotFoundError);
  });

  it('tracks supported extensions helper', async () => {
    const library = new SoundLibrary(tempDirectory);
    await library.waitForInitialScan();

    expect(library.isSupportedFileName('clip.mp3')).toBe(true);
    expect(library.isSupportedFileName('clip.MP3')).toBe(true);
    expect(library.isSupportedFileName('clip.txt')).toBe(false);
  });
});
