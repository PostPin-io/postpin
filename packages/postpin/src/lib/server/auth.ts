import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './database'; // your prisma client instance

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: 'postgresql' // or "mysql", "sqlite", ...etc
	}),
	emailAndPassword: { enabled: true }
});
