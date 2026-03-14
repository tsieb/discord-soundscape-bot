import { Express, Request, Response } from 'express';
import { InvalidDensityCurveError } from '../../services/density-curve-service';
import { CurvePoint } from '../../types';
import {
  getReadonlyGuildId,
  isRecord,
  parseCurvePresetName,
  requireActiveGuildId,
  sendJsonError,
} from '../route-helpers';
import { DashboardServices } from '../types';

const getCurvePoints = (request: Request): CurvePoint[] | null => {
  if (!isRecord(request.body) || !Array.isArray(request.body.points)) {
    return null;
  }

  const points: CurvePoint[] = [];
  for (const point of request.body.points) {
    if (!isRecord(point) || typeof point.t !== 'number' || typeof point.d !== 'number') {
      return null;
    }

    points.push({
      t: point.t,
      d: point.d,
    });
  }

  return points;
};

export const registerDensityRoutes = (
  app: Express,
  services: DashboardServices,
): void => {
  app.get('/api/density-curve', (_request: Request, response: Response) => {
    const guildId = getReadonlyGuildId(services);
    response.json({
      preset: services.densityCurveService.getPresetName(guildId),
      points: services.densityCurveService.getCurve(guildId),
      cdf: services.densityCurveService.getCdfData(guildId),
    });
  });

  app.put('/api/density-curve', async (request: Request, response: Response) => {
    const guildId = requireActiveGuildId(services, response);
    if (guildId === null) {
      return;
    }

    const points = getCurvePoints(request);
    if (points === null) {
      sendJsonError(
        response,
        400,
        'Density curve body must include a valid points array.',
      );
      return;
    }

    try {
      await services.densityCurveService.setCurve(guildId, points);
      response.json({
        points: services.densityCurveService.getCurve(guildId),
        cdf: services.densityCurveService.getCdfData(guildId),
      });
    } catch (error: unknown) {
      if (error instanceof InvalidDensityCurveError) {
        sendJsonError(response, 400, error.message);
        return;
      }

      throw error;
    }
  });

  app.post(
    '/api/density-curve/preset',
    async (request: Request, response: Response) => {
      const guildId = requireActiveGuildId(services, response);
      if (guildId === null) {
        return;
      }

      const preset = parseCurvePresetName(request);
      if (preset === null) {
        sendJsonError(response, 400, 'A valid density curve preset is required.');
        return;
      }

      await services.densityCurveService.applyPreset(guildId, preset);
      response.json({
        preset: services.densityCurveService.getPresetName(guildId),
        points: services.densityCurveService.getCurve(guildId),
        cdf: services.densityCurveService.getCdfData(guildId),
      });
    },
  );
};
