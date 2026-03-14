import { Express, Request, Response } from 'express';
import { SseBroadcaster } from '../sse-broadcaster';
import { DashboardServices } from '../types';

export const registerEventRoutes = (
  app: Express,
  services: DashboardServices,
  broadcaster: SseBroadcaster,
): void => {
  app.get('/api/events', (_request: Request, response: Response) => {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    broadcaster.addClient(response);
    const primaryGuildId = services.sessionManager.getPrimaryGuildId();
    response.write(
      `event: session_update\ndata: ${JSON.stringify(services.sessionManager.getSessionSnapshot(primaryGuildId))}\n\n`,
    );

    response.on('close', () => {
      broadcaster.removeClient(response);
    });
  });
};
