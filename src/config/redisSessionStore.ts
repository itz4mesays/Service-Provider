import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import envVars from '../validations/validateEnv';

// Step 1: Create Redis client
const redisClient = createClient({
    url: 'redis://localhost:6379', // Replace with your Redis server URL
});

redisClient.connect(); // Connect asynchronously

// Step 2: Configure RedisStore
const store = new RedisStore({
    client: redisClient,
    prefix: 'sess:', // Optional session key prefix
});

// Step 3: Set up session middleware
const sessionMiddleware = session({
    store: store, // Use the Redis store
    secret: envVars.SESSION_SECRET, // Secret key for signing the session ID cookie
    resave: false, // Set to false to avoid resaving unmodified sessions
    saveUninitialized: false, // Don't save uninitialized sessions
    cookie: {
        httpOnly: true,
        secure: false, // Set to true if using HTTPS
        sameSite: 'lax',
        maxAge: 86400000, // 1 day
    },
});

console.log(`Session Middleware`, sessionMiddleware)

export default sessionMiddleware;
