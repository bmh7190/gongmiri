const PREFIX = "[gongmiri]" as const;
const DEBUG_ENABLED = import.meta.env.DEV;

export const logDebug = (...args: unknown[]) => {
  if (!DEBUG_ENABLED) return;
  console.log(PREFIX, ...args);
};

export const logWarn = (...args: unknown[]) => {
  if (!DEBUG_ENABLED) return;
  console.warn(PREFIX, ...args);
};
