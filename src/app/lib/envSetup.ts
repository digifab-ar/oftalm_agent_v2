import dotenv from 'dotenv';

// Next.js automatically loads .env.local, but we also try .env as fallback
dotenv.config({path: './.env.local'});
dotenv.config({path: './.env'}); // Fallback to .env if .env.local doesn't exist