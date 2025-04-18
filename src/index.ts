import dotenv from 'dotenv'
dotenv.config()
import express, { Application, NextFunction, Request, Response } from 'express'
import morgan from 'morgan'
import cors from 'cors'
import envVars from './validations/validateEnv'
import { logger } from './utils/logger'
import bodyParser from 'body-parser'
import mainRoute from './routes/main.router'
import session from 'express-session'; // Correct import
import accountRoute from './routes/account.router'
import swaggerUi from 'swagger-ui-express'
import swaggerJsdoc from 'swagger-jsdoc'
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';
// import sessionMiddleware from './config/redisSessionStore'

const app: Application = express();

// Initialize Redis client
const redisClient = createClient({
  url: 'redis://localhost:6379', // Your Redis URL
});

// Connect to Redis
redisClient.connect().catch((err) => {
  console.error('Error connecting to Redis:', err);
});

// Initialize session store using Redis
const sessionStore = new RedisStore({
  client: redisClient,
  prefix: 'sess:', // Prefix for session keys
});

// Use session middleware - **MUST BE ADDED BEFORE ANY ROUTES THAT USE req.session**
app.use(session({
  store: sessionStore,
  secret: envVars.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,  // Set to true if using HTTPS
    sameSite: 'lax',
    maxAge: 86400000,  // 1 day in ms
  },
}));

// Define the list of allowed origins
const allowedOrigins = [
  envVars.SERVICE_PROVIDER_URL,
  envVars.IDENTITY_PROVIDER_URL,
];

// Configure CORS
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if the origin is in the allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Include cookies or authentication headers
}));

// Middleware to parse JSON and URL-encoded bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(morgan('combined'));

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Account Api Documentation",
      version: "1.0.0",
      description: "Account Management API documentation with Swagger",
      license: {
        name: "MIT",
        url: "https://spdx.org/licenses/MIT.html",
      },
      contact: {
        name: "Oyedele Olufemi",
        email: "oyedele.phemy@gmail.com",
      },
    },
    schemes: ['http', 'https'],
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        in: 'header',
        name: 'Authorization',
        description: 'Bearer token to access these api endpoints',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    servers: [
      {
        url: `http://localhost:${envVars.APP_PORT}`,
        description: 'Local Server'
      }, {
        url: `http://214.134.167.72.host.secureserver.net:${envVars.APP_PORT}`,
        description: "Staging Server"
      }
    ],
  },
  apis: ['./src/routes/*.ts'], // Path to your API files
};

const swaggerSpecs = swaggerJsdoc(swaggerOptions);

// Serve Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, { explorer: true }));

//logger
logger;

// Set the port, ensuring it’s a number or string
const port: string | number = envVars.APP_PORT || 8001;

app.get('/session-debug', (req: Request, res: Response) => {
  res.json({
    session: req.session,
  });
});

//define routes
app.use('/saml', mainRoute)
app.use('/api/v1/account', accountRoute)

app.listen(port, () => {
  console.log(`Service Provider is up and running on ${port}`);
});