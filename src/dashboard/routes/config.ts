import { Express, Request, Response } from 'express';
import { InvalidGuildConfigError } from '../../services/config-service';
import {
  getReadonlyGuildId,
  isRecord,
  requireActiveGuildId,
  sendJsonError,
} from '../route-helpers';
import { DashboardServices } from '../types';

const getConfigPatch = (request: Request): Record<string, number> | null => {
  if (!isRecord(request.body)) {
    return null;
  }

  const patch: Record<string, number> = {};
  for (const field of ['minInterval', 'maxInterval', 'volume'] as const) {
    const value = request.body[field];
    if (typeof value === 'number') {
      patch[field] = value;
    }
  }

  return patch;
};

export const registerConfigRoutes = (
  app: Express,
  services: DashboardServices,
): void => {
  app.get('/api/config', (_request: Request, response: Response) => {
    const guildId = getReadonlyGuildId(services);
    const config =
      guildId === '__dashboard_readonly__'
        ? services.configService.getDefaultConfig()
        : services.configService.getConfig(guildId);
    response.json(config);
  });

  app.patch('/api/config', (request: Request, response: Response) => {
    const guildId = requireActiveGuildId(services, response);
    if (guildId === null) {
      return;
    }

    const patch = getConfigPatch(request);
    if (patch === null) {
      sendJsonError(response, 400, 'Config patch body must be a JSON object.');
      return;
    }

    try {
      services.configService.setConfig(guildId, patch);
      const config = services.configService.getConfig(guildId);
      services.sessionManager.updateSessionConfig(guildId, config);
      response.json(config);
    } catch (error: unknown) {
      if (error instanceof InvalidGuildConfigError) {
        sendJsonError(response, 400, error.message);
        return;
      }

      throw error;
    }
  });
};
