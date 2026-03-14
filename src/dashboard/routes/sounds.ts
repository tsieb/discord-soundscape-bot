import { Express, Request, Response } from 'express';
import { InvalidSoundConfigError } from '../../services/sound-config-service';
import { SoundNotFoundError } from '../../services/sound-library';
import {
  getDashboardGuildId,
  getReadonlyGuildId,
  isRecord,
  requireActiveGuildId,
  sendJsonError,
} from '../route-helpers';
import { DashboardServices } from '../types';

const getSoundConfigPatch = (
  request: Request,
): Record<string, boolean | number | undefined> | null => {
  if (!isRecord(request.body)) {
    return null;
  }

  const patch: Record<string, boolean | number | undefined> = {};
  for (const numericField of [
    'volume',
    'weight',
    'minInterval',
    'maxInterval',
  ] as const) {
    const value = request.body[numericField];
    if (typeof value === 'number') {
      patch[numericField] = value;
    }
  }

  const enabled = request.body.enabled;
  if (typeof enabled === 'boolean') {
    patch.enabled = enabled;
  }

  if (request.body.minInterval === null) {
    patch.minInterval = undefined;
  }

  if (request.body.maxInterval === null) {
    patch.maxInterval = undefined;
  }

  return patch;
};

export const registerSoundRoutes = (
  app: Express,
  services: DashboardServices,
): void => {
  app.get('/api/sounds', (_request: Request, response: Response) => {
    const guildId = getReadonlyGuildId(services);
    const sounds = services.soundLibrary.getSounds().map((sound) => {
      return {
        ...sound,
        config: services.soundConfigService.getSoundConfig(guildId, sound.name),
        lastPlayed:
          guildId === '__dashboard_readonly__'
            ? null
            : services.sessionManager.getLastPlayedAt(guildId, sound.name),
      };
    });

    response.json({ sounds });
  });

  app.patch('/api/sounds/:name', async (request: Request, response: Response) => {
    const guildId = requireActiveGuildId(services, response);
    if (guildId === null) {
      return;
    }

    const soundName = Array.isArray(request.params.name)
      ? request.params.name[0]
      : request.params.name;
    const sound = services.soundLibrary.getSoundByName(soundName);
    if (sound === undefined) {
      sendJsonError(response, 404, `Sound "${soundName}" was not found.`);
      return;
    }

    const patch = getSoundConfigPatch(request);
    if (patch === null) {
      sendJsonError(
        response,
        400,
        'Sound config patch body must be a JSON object.',
      );
      return;
    }

    try {
      const config = await services.soundConfigService.setSoundConfig(
        guildId,
        sound.name,
        patch,
      );
      services.sessionManager.applySoundConfig(guildId, sound.name);
      response.json({
        name: sound.name,
        config,
      });
    } catch (error: unknown) {
      if (error instanceof InvalidSoundConfigError) {
        sendJsonError(response, 400, error.message);
        return;
      }

      throw error;
    }
  });

  app.post(
    '/api/sounds/:name/play',
    async (request: Request, response: Response) => {
      const guildId = getDashboardGuildId(services);
      if (guildId === null || services.sessionManager.getSession(guildId) === undefined) {
        sendJsonError(response, 409, 'No active session is available for playback.');
        return;
      }

      const soundName = Array.isArray(request.params.name)
        ? request.params.name[0]
        : request.params.name;
      const sound = services.soundLibrary.getSoundByName(soundName);
      if (sound === undefined) {
        sendJsonError(
          response,
          404,
          `Sound "${soundName}" was not found.`,
        );
        return;
      }

      try {
        const soundConfig = services.soundConfigService.getSoundConfig(
          guildId,
          sound.name,
        );
        await services.sessionManager.playSoundNow(
          guildId,
          sound.path,
          soundConfig.volume,
        );
        response.status(204).end();
      } catch (error: unknown) {
        if (error instanceof SoundNotFoundError) {
          sendJsonError(response, 404, error.message);
          return;
        }

        sendJsonError(response, 500, 'Failed to play sound.');
      }
    },
  );
};
