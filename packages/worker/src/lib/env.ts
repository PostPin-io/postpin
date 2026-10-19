import { databaseEnvVars, parseEnv, redisEnvVars, s3EnvVars } from "@postpin-io/shared/env";

export const env = parseEnv({ ...databaseEnvVars, ...redisEnvVars, ...s3EnvVars }, process.env);
