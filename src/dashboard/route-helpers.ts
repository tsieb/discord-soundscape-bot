import { Request, Response } from 'express';
import { CURVE_PRESET_NAMES, CurvePresetName } from '../data/curve-presets';
import { DashboardServices } from './types';

const READONLY_GUILD_ID = '__dashboard_readonly__';

export const getDashboardGuildId = (
  services: DashboardServices,
): string | null => {
  return services.sessionManager.getActiveGuildId();
};

export const getReadonlyGuildId = (
  services: DashboardServices,
): string => {
  return getDashboardGuildId(services) ?? READONLY_GUILD_ID;
};

export const isRecord = (
  value: unknown,
): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const sendJsonError = (
  response: Response,
  statusCode: number,
  message: string,
): void => {
  response.status(statusCode).json({ error: message });
};

export const requireActiveGuildId = (
  services: DashboardServices,
  response: Response,
): string | null => {
  const guildId = getDashboardGuildId(services);
  if (guildId !== null) {
    return guildId;
  }

  sendJsonError(
    response,
    409,
    'No active guild session is available for dashboard control.',
  );
  return null;
};

export const parseCurvePresetName = (
  request: Request,
): CurvePresetName | null => {
  if (!isRecord(request.body)) {
    return null;
  }

  const preset = request.body.preset;
  if (
    typeof preset === 'string' &&
    CURVE_PRESET_NAMES.includes(preset as CurvePresetName)
  ) {
    return preset as CurvePresetName;
  }

  return null;
};
