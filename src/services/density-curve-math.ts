import { DensityCurve } from '../types';

export interface CurveValidationResultOk {
  ok: true;
}

export interface CurveValidationResultError {
  ok?: false;
  error: string;
}

export type CurveValidationResult =
  | CurveValidationResultOk
  | CurveValidationResultError;

export interface DensityCurveCdf {
  readonly t: number[];
  readonly cdf: number[];
  readonly densities: number[];
  readonly totalArea: number;
}

export const validateCurve = (points: DensityCurve): CurveValidationResult => {
  if (points.length < 2) {
    return { error: 'At least 2 points required' };
  }

  if (points[0].t < 0) {
    return { error: 'First time value must be greater than or equal to 0' };
  }

  if (points[0].d < 0) {
    return { error: 'Density must be non-negative (index 0)' };
  }

  for (let index = 1; index < points.length; index += 1) {
    if (points[index].t <= points[index - 1].t) {
      return {
        error: `t values must be strictly increasing (index ${index})`,
      };
    }

    if (points[index].d < 0) {
      return { error: `Density must be non-negative (index ${index})` };
    }
  }

  if (!points.some((point) => point.d > 0)) {
    return { error: 'At least one density value must be > 0' };
  }

  return { ok: true };
};

export const buildCdf = (points: DensityCurve): DensityCurveCdf => {
  const validationResult = validateCurve(points);
  if (!validationResult.ok) {
    throw new Error(validationResult.error);
  }

  const cumulativeAreas: number[] = [0];
  let totalArea = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const leftPoint = points[index];
    const rightPoint = points[index + 1];
    const width = rightPoint.t - leftPoint.t;
    const segmentArea = width * (leftPoint.d + rightPoint.d) * 0.5;

    totalArea += segmentArea;
    cumulativeAreas.push(totalArea);
  }

  if (totalArea <= 0) {
    throw new Error('Density curve total area must be greater than 0');
  }

  return {
    t: points.map((point) => point.t),
    cdf: cumulativeAreas.map((area) => area / totalArea),
    densities: points.map((point) => point.d),
    totalArea,
  };
};

export const sampleFromCdf = (
  cdfData: DensityCurveCdf,
  randomValue = Math.random(),
): number => {
  const clampedRandomValue = Math.min(Math.max(randomValue, 0), 1);
  const lastIndex = cdfData.cdf.length - 1;

  if (clampedRandomValue <= 0) {
    return cdfData.t[0];
  }

  if (clampedRandomValue >= 1) {
    return cdfData.t[lastIndex];
  }

  let low = 0;
  let high = lastIndex;

  while (low < high - 1) {
    const middle = Math.floor((low + high) / 2);
    if (cdfData.cdf[middle] <= clampedRandomValue) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const leftTime = cdfData.t[low];
  const rightTime = cdfData.t[low + 1];
  const leftDensity = cdfData.densities[low];
  const rightDensity = cdfData.densities[low + 1];
  const leftCdf = cdfData.cdf[low];
  const rightCdf = cdfData.cdf[low + 1];
  const targetArea = (clampedRandomValue - leftCdf) * cdfData.totalArea;
  const segmentWidth = rightTime - leftTime;
  const slope = (rightDensity - leftDensity) / segmentWidth;

  if (Math.abs(slope) < Number.EPSILON) {
    if (leftDensity <= 0) {
      return leftTime;
    }

    return leftTime + targetArea / leftDensity;
  }

  const discriminant = leftDensity * leftDensity + 2 * slope * targetArea;
  if (discriminant <= 0) {
    return leftTime;
  }

  const offset = (-leftDensity + Math.sqrt(discriminant)) / slope;
  const segmentOffset = Math.min(Math.max(offset, 0), segmentWidth);

  if (Number.isFinite(rightCdf) && rightCdf === leftCdf) {
    return leftTime;
  }

  return leftTime + segmentOffset;
};
