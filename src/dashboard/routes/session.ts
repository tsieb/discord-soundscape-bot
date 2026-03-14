import { Express, Request, Response } from 'express';
import {
  SessionNotFoundError,
} from '../../services/session-manager';
import { getDashboardGuildId, sendJsonError } from '../route-helpers';
import { DashboardServices } from '../types';

export const registerSessionRoutes = (
  app: Express,
  services: DashboardServices,
): void => {
  app.get('/api/session', (_request: Request, response: Response) => {
    const guildId = getDashboardGuildId(services);
    response.json(services.sessionManager.getSessionSnapshot(guildId));
  });

  app.post('/api/session/start', (request: Request, response: Response) => {
    void request;
    const guildId = getDashboardGuildId(services);
    if (guildId === null) {
      sendJsonError(response, 409, 'No active session is available to start.');
      return;
    }

    try {
      const started = services.sessionManager.startPlayback(guildId);
      if (!started) {
        sendJsonError(
          response,
          409,
          'No enabled sounds are available to schedule.',
        );
        return;
      }

      response.status(204).end();
    } catch (error: unknown) {
      if (error instanceof SessionNotFoundError) {
        sendJsonError(response, 409, error.message);
        return;
      }

      throw error;
    }
  });

  app.post('/api/session/stop', (request: Request, response: Response) => {
    void request;
    const guildId = getDashboardGuildId(services);
    if (guildId === null) {
      sendJsonError(response, 409, 'No active session is available to stop.');
      return;
    }

    try {
      services.sessionManager.stopPlayback(guildId);
      response.status(204).end();
    } catch (error: unknown) {
      if (error instanceof SessionNotFoundError) {
        sendJsonError(response, 409, error.message);
        return;
      }

      throw error;
    }
  });

  app.post('/api/session/leave', (request: Request, response: Response) => {
    void request;
    const guildId = getDashboardGuildId(services);
    if (guildId === null) {
      sendJsonError(response, 409, 'No active session is available to leave.');
      return;
    }

    services.sessionManager.destroySession(guildId);
    response.status(204).end();
  });
};
