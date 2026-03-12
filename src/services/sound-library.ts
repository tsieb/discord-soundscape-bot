import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SoundFile } from '../types';
import * as logger from '../util/logger';

const DEFAULT_CATEGORY = 'default';
const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.webm']);
const INVALID_FILENAME_CHARS = /[^a-zA-Z0-9-_]/g;

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
      `Unsupported sound format for "${fileName}". Supported formats: ${Array.from(SUPPORTED_EXTENSIONS).join(', ')}.`,
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

  public async addSound(fileName: string, data: Buffer): Promise<SoundFile> {
    const sanitizedFileName = this.sanitizeFileName(fileName);
    const extension = path.extname(sanitizedFileName).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new UnsupportedSoundFormatError(fileName);
    }

    await fs.mkdir(this.soundsDirectory, { recursive: true });
    const destinationPath = path.join(this.soundsDirectory, sanitizedFileName);
    await fs.writeFile(destinationPath, data);
    logger.info(`Added sound file: ${destinationPath}`);

    await this.rescan();

    const addedSoundName = path.basename(sanitizedFileName, extension);
    const addedSound = this.getSoundByName(addedSoundName);

    if (addedSound === undefined) {
      throw new SoundNotFoundError(addedSoundName);
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
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
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
}
