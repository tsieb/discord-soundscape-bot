import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SoundFile } from '../types';
import * as logger from '../util/logger';

const DEFAULT_CATEGORY = 'default';
const INVALID_CATEGORY_CHARS = /[^a-zA-Z0-9-_]/g;
const INVALID_FILENAME_CHARS = /[^a-zA-Z0-9-_]/g;

export const SUPPORTED_SOUND_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.webm',
] as const;

const SUPPORTED_EXTENSION_SET = new Set<string>(SUPPORTED_SOUND_EXTENSIONS);

export class EmptySoundLibraryError extends Error {
  constructor() {
    super(
      'Sound library is empty. Add at least one supported audio file to continue.',
    );
    this.name = 'EmptySoundLibraryError';
  }
}

export class UnsupportedSoundFormatError extends Error {
  constructor(fileName: string) {
    super(
      `Unsupported sound format for "${fileName}". Supported formats: ${SUPPORTED_SOUND_EXTENSIONS.join(', ')}.`,
    );
    this.name = 'UnsupportedSoundFormatError';
  }
}

export class SoundNotFoundError extends Error {
  constructor(name: string) {
    super(`Sound "${name}" was not found in the library.`);
    this.name = 'SoundNotFoundError';
  }
}

export class InvalidSoundFileNameError extends Error {
  constructor(fileName: string) {
    super(`Invalid sound filename "${fileName}".`);
    this.name = 'InvalidSoundFileNameError';
  }
}

export class InvalidSoundCategoryError extends Error {
  constructor(category: string) {
    super(`Invalid sound category "${category}".`);
    this.name = 'InvalidSoundCategoryError';
  }
}

export class SoundLibrary {
  private readonly soundsDirectory: string;

  private readonly initialScanPromise: Promise<void>;

  private sounds: SoundFile[] = [];

  private lastPlayedSoundPath: string | null = null;

  constructor(soundsDirectory: string) {
    this.soundsDirectory = path.resolve(soundsDirectory);
    this.initialScanPromise = this.scan();
  }

  public async waitForInitialScan(): Promise<void> {
    await this.initialScanPromise;
  }

  public async scan(): Promise<void> {
    logger.info(`Scanning sounds directory: ${this.soundsDirectory}`);
    await fs.mkdir(this.soundsDirectory, { recursive: true });
    const files = await this.collectSoundFiles(this.soundsDirectory);
    this.sounds = files;

    if (
      this.lastPlayedSoundPath !== null &&
      !this.sounds.some((sound) => sound.path === this.lastPlayedSoundPath)
    ) {
      this.lastPlayedSoundPath = null;
    }

    logger.info(`Sound scan complete. Loaded ${this.sounds.length} sound(s).`);
  }

  public async rescan(): Promise<void> {
    await this.scan();
  }

  public getRandomSound(): SoundFile {
    if (this.sounds.length === 0) {
      throw new EmptySoundLibraryError();
    }

    const randomSound = this.pickRandomSound();
    this.lastPlayedSoundPath = randomSound.path;
    return randomSound;
  }

  public getSounds(): SoundFile[] {
    return [...this.sounds];
  }

  public getSoundCount(): number {
    return this.sounds.length;
  }

  public getSoundByName(name: string): SoundFile | undefined {
    const normalizedName = name.trim().toLowerCase();
    return this.sounds.find((sound) => sound.name.toLowerCase() === normalizedName);
  }

  public getCategories(): string[] {
    const uniqueCategories = new Set<string>(
      this.sounds.map((sound) => sound.category),
    );
    return Array.from(uniqueCategories).sort();
  }

  public isSupportedFileName(fileName: string): boolean {
    const extension = path.extname(fileName).toLowerCase();
    return SUPPORTED_EXTENSION_SET.has(extension);
  }

  public async addSound(
    fileName: string,
    data: Buffer,
    category?: string,
  ): Promise<SoundFile> {
    const sanitizedFileName = this.sanitizeFileName(fileName);
    const extension = path.extname(sanitizedFileName).toLowerCase();

    if (!SUPPORTED_EXTENSION_SET.has(extension)) {
      throw new UnsupportedSoundFormatError(fileName);
    }

    const destinationDirectory =
      category === undefined
        ? this.soundsDirectory
        : path.join(this.soundsDirectory, this.sanitizeCategory(category));

    await fs.mkdir(destinationDirectory, { recursive: true });
    const uniqueFileName = await this.resolveUniqueFileName(
      destinationDirectory,
      sanitizedFileName,
    );
    const destinationPath = path.join(destinationDirectory, uniqueFileName);
    await fs.writeFile(destinationPath, data);
    logger.info(`Added sound file: ${destinationPath}`);

    await this.rescan();

    const absoluteDestinationPath = path.resolve(destinationPath);
    const addedSound = this.sounds.find((sound) => {
      return sound.path === absoluteDestinationPath;
    });

    if (addedSound === undefined) {
      throw new SoundNotFoundError(path.basename(uniqueFileName, extension));
    }

    return addedSound;
  }

  public async removeSound(name: string): Promise<void> {
    const sound = this.getSoundByName(name);

    if (sound === undefined) {
      throw new SoundNotFoundError(name);
    }

    await fs.unlink(sound.path);
    logger.info(`Removed sound file: ${sound.path}`);
    await this.rescan();
  }

  private pickRandomSound(): SoundFile {
    if (this.sounds.length === 1) {
      return this.sounds[0];
    }

    let randomSound = this.sounds[Math.floor(Math.random() * this.sounds.length)];

    while (randomSound.path === this.lastPlayedSoundPath) {
      randomSound = this.sounds[Math.floor(Math.random() * this.sounds.length)];
    }

    return randomSound;
  }

  private async collectSoundFiles(directory: string): Promise<SoundFile[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const sounds: SoundFile[] = [];

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        const nestedSounds = await this.collectSoundFiles(entryPath);
        sounds.push(...nestedSounds);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSION_SET.has(extension)) {
        continue;
      }

      const absolutePath = path.resolve(entryPath);
      const relativeDirectory = path.relative(
        this.soundsDirectory,
        path.dirname(absolutePath),
      );
      const category = this.resolveCategory(relativeDirectory);

      sounds.push({
        name: path.basename(entry.name, extension),
        path: absolutePath,
        category,
      });
    }

    sounds.sort((left, right) => left.path.localeCompare(right.path));
    return sounds;
  }

  private resolveCategory(relativeDirectory: string): string {
    if (relativeDirectory === '') {
      return DEFAULT_CATEGORY;
    }

    const [firstSegment] = relativeDirectory.split(path.sep);
    return firstSegment === '' ? DEFAULT_CATEGORY : firstSegment;
  }

  private sanitizeFileName(fileName: string): string {
    const baseName = path.basename(fileName);
    const extension = path.extname(baseName).toLowerCase();
    const rawName = path.basename(baseName, extension);
    const sanitizedName = rawName.replace(INVALID_FILENAME_CHARS, '-').trim();

    if (sanitizedName === '' || extension === '') {
      throw new InvalidSoundFileNameError(fileName);
    }

    return `${sanitizedName}${extension}`;
  }

  private sanitizeCategory(category: string): string {
    const normalized = category
      .trim()
      .toLowerCase()
      .replace(INVALID_CATEGORY_CHARS, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (normalized === '') {
      throw new InvalidSoundCategoryError(category);
    }

    return normalized;
  }

  private async resolveUniqueFileName(
    directory: string,
    initialFileName: string,
  ): Promise<string> {
    const extension = path.extname(initialFileName);
    const baseName = path.basename(initialFileName, extension);
    let candidate = initialFileName;
    let suffix = 2;

    while (await this.pathExists(path.join(directory, candidate))) {
      candidate = `${baseName}-${suffix}${extension}`;
      suffix += 1;
    }

    return candidate;
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
