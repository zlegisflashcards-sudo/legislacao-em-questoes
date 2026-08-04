type BuildEnvironment = Record<string, string | undefined>;

/** Server-side flag enabled only by the dedicated offline build command. */
export function isOfflineBuild(
  environment: BuildEnvironment = process.env,
) {
  return environment.BUILD_OFFLINE === "true";
}
