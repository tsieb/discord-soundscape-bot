import { Response } from 'express';

const KEEP_ALIVE_INTERVAL_MS = 15_000;

export interface DashboardEvent<T = unknown> {
  event: string;
  data: T;
}

export class SseBroadcaster {
  private readonly clients = new Set<Response>();

  private readonly keepAliveInterval: NodeJS.Timeout;

  constructor() {
    this.keepAliveInterval = setInterval(() => {
      for (const client of this.clients) {
        client.write(': keep-alive\n\n');
      }
    }, KEEP_ALIVE_INTERVAL_MS);
    this.keepAliveInterval.unref();
  }

  public addClient(response: Response): void {
    this.clients.add(response);
  }

  public removeClient(response: Response): void {
    this.clients.delete(response);
  }

  public broadcast<T>(event: DashboardEvent<T>): void {
    const payload = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  public close(): void {
    clearInterval(this.keepAliveInterval);
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
  }
}
