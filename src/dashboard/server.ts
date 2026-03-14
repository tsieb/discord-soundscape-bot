import { createServer, Server } from 'node:http';
import path from 'node:path';
import express, { Express, Request, Response } from 'express';
import { SessionManager } from '../services/session-manager';
import { SseBroadcaster } from './sse-broadcaster';

export interface DashboardServerDependencies {
  sessionManager: SessionManager;
}

export interface DashboardServer {
  app: Express;
  broadcaster: SseBroadcaster;
  close(): void;
  listen: Server['listen'];
}

const PUBLIC_DIRECTORY = path.resolve(__dirname, 'public');

const registerSseRoute = (
  app: Express,
  sessionManager: SessionManager,
  broadcaster: SseBroadcaster,
): void => {
  app.get('/api/events', (_request: Request, response: Response) => {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    broadcaster.addClient(response);
    const primaryGuildId = sessionManager.getPrimaryGuildId();
    response.write(
      `event: session_update\ndata: ${JSON.stringify(sessionManager.getSessionSnapshot(primaryGuildId))}\n\n`,
    );

    response.on('close', () => {
      broadcaster.removeClient(response);
    });
  });
};

export const createDashboardServer = (
  dependencies: DashboardServerDependencies,
): DashboardServer => {
  const app = express();
  const broadcaster = new SseBroadcaster();
  const server = createServer(app);

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

  app.use(express.static(PUBLIC_DIRECTORY));
  registerSseRoute(app, dependencies.sessionManager, broadcaster);

  app.get('*all', (_request: Request, response: Response) => {
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
