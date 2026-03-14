(function () {
  const TIME_TICKS = [0, 5, 10, 30, 60, 120, 300, 600, 900];
  const MAX_HISTORY = 10;
  const PADDING = { top: 24, right: 22, bottom: 42, left: 42 };

  const clamp = (value, min, max) => {
    return Math.min(max, Math.max(min, value));
  };

  const clonePoints = (points) => {
    return points.map((point) => ({ t: point.t, d: point.d }));
  };

  const getMaxTime = (points) => {
    return Math.max(300, ...points.map((point) => point.t), 900);
  };

  const getMaxDensity = (points) => {
    return Math.max(1, ...points.map((point) => point.d)) * 1.15;
  };

  const validatePoints = (points) => {
    if (!Array.isArray(points) || points.length < 2) {
      return false;
    }

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!Number.isFinite(point.t) || !Number.isFinite(point.d) || point.t < 0 || point.d < 0) {
        return false;
      }

      if (index > 0 && point.t <= points[index - 1].t) {
        return false;
      }
    }

    return points.some((point) => point.d > 0);
  };

  const buildCdf = (points) => {
    const cumulative = [0];
    let totalArea = 0;

    for (let index = 0; index < points.length - 1; index += 1) {
      const left = points[index];
      const right = points[index + 1];
      const segmentArea = (right.t - left.t) * (left.d + right.d) * 0.5;
      totalArea += segmentArea;
      cumulative.push(totalArea);
    }

    return {
      t: points.map((point) => point.t),
      d: points.map((point) => point.d),
      cdf: cumulative.map((value) => value / totalArea),
      totalArea,
    };
  };

  const sampleFromCdf = (cdfData) => {
    const target = Math.random();
    let low = 0;
    let high = cdfData.cdf.length - 1;

    while (low < high - 1) {
      const middle = Math.floor((low + high) / 2);
      if (cdfData.cdf[middle] <= target) {
        low = middle;
      } else {
        high = middle;
      }
    }

    const leftTime = cdfData.t[low];
    const rightTime = cdfData.t[low + 1];
    const leftDensity = cdfData.d[low];
    const rightDensity = cdfData.d[low + 1];
    const leftCdf = cdfData.cdf[low];
    const targetArea = (target - leftCdf) * cdfData.totalArea;
    const slope = (rightDensity - leftDensity) / (rightTime - leftTime);

    if (Math.abs(slope) < Number.EPSILON) {
      return leftDensity > 0 ? leftTime + targetArea / leftDensity : leftTime;
    }

    const discriminant = leftDensity * leftDensity + 2 * slope * targetArea;
    if (discriminant <= 0) {
      return leftTime;
    }

    return clamp(
      leftTime + (-leftDensity + Math.sqrt(discriminant)) / slope,
      leftTime,
      rightTime,
    );
  };

  const createCurveEditor = ({
    canvas,
    histogramCanvas,
    onChange,
  }) => {
    const context = canvas.getContext('2d');
    const histogramContext = histogramCanvas.getContext('2d');
    const state = {
      points: [],
      draggedIndex: null,
      history: [],
      historyIndex: -1,
      histogramTimer: null,
    };

    const timeToX = (time) => {
      const width = canvas.width - PADDING.left - PADDING.right;
      const normalized = Math.log10(time + 1) / Math.log10(getMaxTime(state.points) + 1);
      return PADDING.left + normalized * width;
    };

    const xToTime = (x) => {
      const width = canvas.width - PADDING.left - PADDING.right;
      const normalized = clamp((x - PADDING.left) / width, 0, 1);
      return (getMaxTime(state.points) + 1) ** normalized - 1;
    };

    const densityToY = (density) => {
      const height = canvas.height - PADDING.top - PADDING.bottom;
      return canvas.height - PADDING.bottom - (density / getMaxDensity(state.points)) * height;
    };

    const yToDensity = (y) => {
      const height = canvas.height - PADDING.top - PADDING.bottom;
      return clamp(
        ((canvas.height - PADDING.bottom - y) / height) * getMaxDensity(state.points),
        0,
        getMaxDensity(state.points),
      );
    };

    const findPointIndex = (x, y) => {
      for (let index = 0; index < state.points.length; index += 1) {
        const point = state.points[index];
        const dx = timeToX(point.t) - x;
        const dy = densityToY(point.d) - y;
        if (Math.sqrt(dx * dx + dy * dy) <= 12) {
          return index;
        }
      }

      return null;
    };

    const pushHistory = () => {
      const snapshot = clonePoints(state.points);
      const currentSnapshot = state.history[state.historyIndex];
      if (currentSnapshot && JSON.stringify(currentSnapshot) === JSON.stringify(snapshot)) {
        return;
      }

      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(snapshot);
      if (state.history.length > MAX_HISTORY) {
        state.history.shift();
      }
      state.historyIndex = state.history.length - 1;
    };

    const drawHistogram = () => {
      histogramContext.clearRect(0, 0, histogramCanvas.width, histogramCanvas.height);
      if (!validatePoints(state.points)) {
        return;
      }

      const samples = Array.from({ length: 500 }, () => sampleFromCdf(buildCdf(state.points)));
      const bucketCount = 24;
      const maxTime = getMaxTime(state.points);
      const buckets = Array.from({ length: bucketCount }, () => 0);

      for (const sample of samples) {
        const bucketIndex = Math.min(
          bucketCount - 1,
          Math.floor((sample / maxTime) * bucketCount),
        );
        buckets[bucketIndex] += 1;
      }

      const maxBucket = Math.max(...buckets, 1);
      const width = histogramCanvas.width / bucketCount;
      buckets.forEach((value, index) => {
        const barHeight = (value / maxBucket) * (histogramCanvas.height - 12);
        histogramContext.fillStyle = 'rgba(143, 211, 255, 0.6)';
        histogramContext.fillRect(
          index * width + 2,
          histogramCanvas.height - barHeight,
          width - 4,
          barHeight,
        );
      });
    };

    const scheduleHistogram = () => {
      if (state.histogramTimer !== null) {
        clearTimeout(state.histogramTimer);
      }

      state.histogramTimer = window.setTimeout(() => {
        drawHistogram();
      }, 500);
    };

    const drawGrid = () => {
      context.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      context.lineWidth = 1;
      context.font = '12px "Avenir Next", "Trebuchet MS", sans-serif';
      context.fillStyle = 'rgba(235, 242, 250, 0.7)';

      const maxDensity = getMaxDensity(state.points);
      for (let index = 0; index <= 4; index += 1) {
        const density = (maxDensity / 4) * index;
        const y = densityToY(density);
        context.beginPath();
        context.moveTo(PADDING.left, y);
        context.lineTo(canvas.width - PADDING.right, y);
        context.stroke();
      }

      for (const tick of TIME_TICKS) {
        const x = timeToX(tick);
        context.beginPath();
        context.moveTo(x, PADDING.top);
        context.lineTo(x, canvas.height - PADDING.bottom);
        context.stroke();
        context.fillText(String(tick), x - 8, canvas.height - 14);
      }
    };

    const drawCurve = () => {
      if (!validatePoints(state.points)) {
        return;
      }

      context.strokeStyle = 'rgba(245, 184, 76, 0.95)';
      context.lineWidth = 3;
      context.beginPath();
      state.points.forEach((point, index) => {
        const x = timeToX(point.t);
        const y = densityToY(point.d);
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.stroke();

      state.points.forEach((point) => {
        context.fillStyle = '#8fd3ff';
        context.beginPath();
        context.arc(timeToX(point.t), densityToY(point.d), 6, 0, Math.PI * 2);
        context.fill();
      });
    };

    const render = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      drawGrid();
      drawCurve();
      scheduleHistogram();
      if (typeof onChange === 'function') {
        onChange(clonePoints(state.points));
      }
    };

    const setPoints = (points, options = {}) => {
      state.points = clonePoints(points).sort((left, right) => left.t - right.t);
      if (options.recordHistory !== false) {
        pushHistory();
      }
      render();
    };

    const removePoint = (index) => {
      if (index === null || state.points.length <= 2) {
        return;
      }

      state.points.splice(index, 1);
      pushHistory();
      render();
    };

    const addPoint = (x, y) => {
      const point = {
        t: Number(xToTime(x).toFixed(1)),
        d: Number(yToDensity(y).toFixed(2)),
      };
      state.points.push(point);
      state.points.sort((left, right) => left.t - right.t);
      if (!validatePoints(state.points)) {
        state.points = state.points.filter((candidate) => candidate !== point);
        return;
      }

      pushHistory();
      render();
    };

    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      removePoint(findPointIndex(event.offsetX, event.offsetY));
    });

    canvas.addEventListener('dblclick', (event) => {
      removePoint(findPointIndex(event.offsetX, event.offsetY));
    });

    canvas.addEventListener('pointerdown', (event) => {
      const pointIndex = findPointIndex(event.offsetX, event.offsetY);
      canvas.setPointerCapture(event.pointerId);
      if (pointIndex !== null) {
        state.draggedIndex = pointIndex;
        return;
      }

      addPoint(event.offsetX, event.offsetY);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (state.draggedIndex === null) {
        return;
      }

      const index = state.draggedIndex;
      const minTime = index === 0 ? 0 : state.points[index - 1].t + 1;
      const maxTime =
        index === state.points.length - 1
          ? getMaxTime(state.points)
          : state.points[index + 1].t - 1;

      state.points[index] = {
        t: Number(clamp(xToTime(event.offsetX), minTime, maxTime).toFixed(1)),
        d: Number(yToDensity(event.offsetY).toFixed(2)),
      };
      render();
    });

    canvas.addEventListener('pointerup', () => {
      if (state.draggedIndex !== null) {
        pushHistory();
        render();
      }
      state.draggedIndex = null;
    });

    return {
      getPoints() {
        return clonePoints(state.points);
      },
      setPoints,
      undo() {
        if (state.historyIndex <= 0) {
          return;
        }
        state.historyIndex -= 1;
        state.points = clonePoints(state.history[state.historyIndex]);
        render();
      },
      redo() {
        if (state.historyIndex >= state.history.length - 1) {
          return;
        }
        state.historyIndex += 1;
        state.points = clonePoints(state.history[state.historyIndex]);
        render();
      },
      render,
    };
  };

  window.createCurveEditor = createCurveEditor;
})();
