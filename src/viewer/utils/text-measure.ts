const cache = new Map<string, TextMetrics>();

const getContext = (() => {
  let ctx: CanvasRenderingContext2D | null = null;
  return () => {
    if (ctx) return ctx;
    const canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = '12px "Pretendard", system-ui, -apple-system, sans-serif';
    }
    return ctx;
  };
})();

export const measureTextWidth = (text: string): number => {
  const ctx = getContext();
  if (!ctx) return text.length * 7;
  if (cache.has(text)) return cache.get(text)!.width;
  const metrics = ctx.measureText(text);
  cache.set(text, metrics);
  return metrics.width;
};
