import { createServer, Server } from 'node:http';
import path from 'node:path';
import express, { Express, Request, Response } from 'express';
import { registerConfigRoutes } from './routes/config';
import { registerDensityRoutes } from './routes/density';
import { registerEventRoutes } from './routes/events';
import { registerSessionRoutes } from './routes/session';
import { registerSoundRoutes } from './routes/sounds';
import { SseBroadcaster } from './sse-broadcaster';
import { DashboardServices } from './types';

export type DashboardServerDependencies = DashboardServices;

export interface DashboardServer {
  app: Express;
  broadcaster: SseBroadcaster;
  close(): void;
  listen: Server['listen'];
}

const PUBLIC_DIRECTORY = path.resolve(__dirname, 'public');

export const createDashboardServer = (
  dependencies: DashboardServerDependencies,
): DashboardServer => {
  const app = express();
  const broadcaster = new SseBroadcaster();
  const server = createServer(app);

  app.use(express.json());

  dependencies.sessionManager.on('session_update', (_guildId, snapshot) => {
    broadcaster.broadcast({
      event: 'session_update',
      data: snapshot,
    });
  });

  dependencies.sessionManager.on('sound_played', (_guildId, playback) => {
    broadcaster.broadcast({
      event: 'sound_played',
      data: playback,
    });
  });

  registerSoundRoutes(app, dependencies);
  registerConfigRoutes(app, dependencies);
  registerDensityRoutes(app, dependencies);
  registerSessionRoutes(app, dependencies);
  registerEventRoutes(app, dependencies, broadcaster);
  app.use(express.static(PUBLIC_DIRECTORY));

  app.get(/.*/, (_request: Request, response: Response) => {
    response.sendFile(path.join(PUBLIC_DIRECTORY, 'index.html'));
  });

  return {
    app,
    broadcaster,
    close(): void {
      broadcaster.close();
      server.close();
    },
    listen: server.listen.bind(server),
  };
};
