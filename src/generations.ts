export const selfGeneration = 2; // Keep the coordinates in older backups.
export const maxGenerations = 100;
export const firstGeneration = selfGeneration - maxGenerations + 1;
export const lastGeneration = selfGeneration + maxGenerations - 1;

export function checkGenerationSpan(generations: number[]) {
  if (
    generations.some(
      (g) => !Number.isInteger(g) || g < firstGeneration || g > lastGeneration,
    ) ||
    Math.max(selfGeneration, ...generations) -
      Math.min(selfGeneration, ...generations) >=
      maxGenerations
  )
    throw new Error(
      `家族树最多支持 ${maxGenerations} 代，请调整辈分或亲属连接`,
    );
}

export function generationName(generation: number) {
  return (
    ["祖辈", "父母辈", "同辈", "子女辈", "孙辈"][generation] ??
    (generation < selfGeneration
      ? `往上 ${selfGeneration - generation} 代`
      : `往下 ${generation - selfGeneration} 代`)
  );
}
