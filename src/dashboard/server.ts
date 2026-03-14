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

  dependencies.configService.subscribe((guildId, patch) => {
    if (dependencies.sessionManager.getPrimaryGuildId() !== guildId) {
      return;
    }

    for (const [field, value] of Object.entries(patch)) {
      broadcaster.broadcast({
        event: 'config_changed',
        data: { field, value },
      });
    }
  });

  dependencies.soundConfigService.subscribe((guildId, soundName, config) => {
    if (dependencies.sessionManager.getPrimaryGuildId() !== guildId) {
      return;
    }

    broadcaster.broadcast({
      event: 'sound_config_changed',
      data: { name: soundName, config },
    });
  });

  dependencies.densityCurveService.subscribe((guildId) => {
    if (dependencies.sessionManager.getPrimaryGuildId() !== guildId) {
      return;
    }

    broadcaster.broadcast({
      event: 'curve_changed',
      data: {
        preset: dependencies.densityCurveService.getPresetName(guildId),
        points: dependencies.densityCurveService.getCurve(guildId),
        cdf: dependencies.densityCurveService.getCdfData(guildId),
      },
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
