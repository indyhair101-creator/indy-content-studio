export interface ProductionBuildInvocation {
  command: string;
  args: string[];
  options: {
    stdio: "inherit";
  };
}

export function productionBuildInvocation(
  platform?: NodeJS.Platform,
  commandInterpreter?: string,
): ProductionBuildInvocation;
