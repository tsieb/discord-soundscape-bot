import { execFile } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import * as logger from '../src/util/logger';

const execFileAsync = promisify(execFile);
const MAX_STARTER_PACK_BYTES = 2 * 1024 * 1024;

type GeneratedCategory = 'tones' | 'noise' | 'chimes';

interface GeneratedSoundSpec {
  readonly category: GeneratedCategory;
  readonly fileName: string;
  readonly inputFilter: string;
  readonly durationSeconds: number;
}

const GENERATED_SOUNDS: readonly GeneratedSoundSpec[] = [
  {
    category: 'tones',
    fileName: 'high-beep.mp3',
    inputFilter: 'sine=frequency=1280:sample_rate=44100',
    durationSeconds: 0.5,
  },
  {
    category: 'tones',
    fileName: 'low-drone.mp3',
    inputFilter: 'sine=frequency=110:sample_rate=44100',
    durationSeconds: 3.5,
  },
  {
    category: 'tones',
    fileName: 'mid-hum.mp3',
    inputFilter: 'sine=frequency=220:sample_rate=44100',
    durationSeconds: 2.4,
  },
  {
    category: 'tones',
    fileName: 'bright-ping.mp3',
    inputFilter: 'sine=frequency=920:sample_rate=44100',
    durationSeconds: 0.8,
  },
  {
    category: 'tones',
    fileName: 'soft-bloop.mp3',
    inputFilter: 'sine=frequency=540:sample_rate=44100',
    durationSeconds: 1.2,
  },
  {
    category: 'tones',
    fileName: 'hollow-buzz.mp3',
    inputFilter: 'sine=frequency=320:sample_rate=44100',
    durationSeconds: 1.8,
  },
  {
    category: 'noise',
    fileName: 'white-noise-burst.mp3',
    inputFilter: 'anoisesrc=color=white:amplitude=0.18:sample_rate=44100',
    durationSeconds: 0.6,
  },
  {
    category: 'noise',
    fileName: 'white-noise-whoosh.mp3',
    inputFilter: 'anoisesrc=color=white:amplitude=0.12:sample_rate=44100',
    durationSeconds: 1.6,
  },
  {
    category: 'noise',
    fileName: 'pink-noise-short.mp3',
    inputFilter: 'anoisesrc=color=pink:amplitude=0.16:sample_rate=44100',
    durationSeconds: 1.0,
  },
  {
    category: 'noise',
    fileName: 'pink-noise-long.mp3',
    inputFilter: 'anoisesrc=color=pink:amplitude=0.1:sample_rate=44100',
    durationSeconds: 2.8,
  },
  {
    category: 'noise',
    fileName: 'brown-noise-rumble.mp3',
    inputFilter: 'anoisesrc=color=brown:amplitude=0.22:sample_rate=44100',
    durationSeconds: 3.2,
  },
  {
    category: 'noise',
    fileName: 'blue-noise-hiss.mp3',
    inputFilter: 'anoisesrc=color=blue:amplitude=0.14:sample_rate=44100',
    durationSeconds: 1.4,
  },
  {
    category: 'chimes',
    fileName: 'bell-chime-a3.mp3',
    inputFilter:
      'aevalsrc=0.75*sin(2*PI*220*t+4*sin(2*PI*5*t))*exp(-3*t):s=44100',
    durationSeconds: 1.8,
  },
  {
    category: 'chimes',
    fileName: 'bell-chime-c4.mp3',
    inputFilter:
      'aevalsrc=0.75*sin(2*PI*262*t+4*sin(2*PI*5*t))*exp(-3*t):s=44100',
    durationSeconds: 1.8,
  },
  {
    category: 'chimes',
    fileName: 'bell-chime-e4.mp3',
    inputFilter:
      'aevalsrc=0.75*sin(2*PI*330*t+4*sin(2*PI*5*t))*exp(-3*t):s=44100',
    durationSeconds: 1.8,
  },
  {
    category: 'chimes',
    fileName: 'fm-pluck-low.mp3',
    inputFilter:
      'aevalsrc=0.8*sin(2*PI*180*t+6*sin(2*PI*8*t))*exp(-4*t):s=44100',
    durationSeconds: 1.4,
  },
  {
    category: 'chimes',
    fileName: 'fm-pluck-high.mp3',
    inputFilter:
      'aevalsrc=0.8*sin(2*PI*520*t+6*sin(2*PI*8*t))*exp(-4*t):s=44100',
    durationSeconds: 1.2,
  },
  {
    category: 'chimes',
    fileName: 'shimmer-chime.mp3',
    inputFilter:
      'aevalsrc=0.72*sin(2*PI*410*t+5*sin(2*PI*7*t))*exp(-3.2*t):s=44100',
    durationSeconds: 2.3,
  },
];

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const ensureFfmpegInstalled = async (): Promise<void> => {
  try {
    await execFileAsync('ffmpeg', ['-version']);
  } catch (error: unknown) {
    throw new Error(
      'FFmpeg was not found in PATH. Install FFmpeg before running npm run generate-sounds.',
      error === undefined ? undefined : { cause: error },
    );
  }
};

const generateSound = async (
  outputRoot: string,
  spec: GeneratedSoundSpec,
): Promise<number> => {
  const categoryDirectory = path.join(outputRoot, spec.category);
  const outputPath = path.join(categoryDirectory, spec.fileName);
  await mkdir(categoryDirectory, { recursive: true });

  const ffmpegArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    spec.inputFilter,
    '-t',
    spec.durationSeconds.toString(),
    '-ar',
    '44100',
    '-ac',
    '1',
    '-codec:a',
    'libmp3lame',
    '-q:a',
    '9',
    '-y',
    outputPath,
  ];

  await execFileAsync('ffmpeg', ffmpegArgs);
  const generatedFile = await stat(outputPath);
  logger.info(
    `Generated ${spec.category}/${spec.fileName} (${formatBytes(generatedFile.size)}).`,
  );
  return generatedFile.size;
};

const run = async (): Promise<void> => {
  await ensureFfmpegInstalled();

  const outputRoot = path.resolve(process.cwd(), 'sounds', 'generated');
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  let totalBytes = 0;
  for (const spec of GENERATED_SOUNDS) {
    totalBytes += await generateSound(outputRoot, spec);
  }

  logger.info(
    `Generated ${GENERATED_SOUNDS.length} sounds in ${outputRoot} (${formatBytes(totalBytes)} total).`,
  );

  if (totalBytes > MAX_STARTER_PACK_BYTES) {
    throw new Error(
      `Starter pack size is ${formatBytes(totalBytes)}, which exceeds the ${formatBytes(MAX_STARTER_PACK_BYTES)} target.`,
    );
  }

  logger.info(
    `Starter pack size is within target (${formatBytes(MAX_STARTER_PACK_BYTES)} max).`,
  );
};

void run().catch((error: unknown) => {
  logger.error('Failed to generate starter sounds.', error);
  process.exit(1);
});
