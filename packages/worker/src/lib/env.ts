import { databaseEnvVars, parseEnv, redisEnvVars, s3EnvVars } from "@postpin/shared/env";

export const env = parseEnv({ ...databaseEnvVars, ...redisEnvVars, ...s3EnvVars }, process.env);
