import dotenv from 'dotenv'
dotenv.config()
import express, { Application, NextFunction, Request, Response } from 'express'
import morgan from 'morgan'
import cors from 'cors'
import { successResponse } from './utils/responseHandler'
import envVars from './validations/validateEnv'
import { logger } from './utils/logger'
import apiHeadersMiddleware from './utils/apiHeaders'
import bodyParser from 'body-parser'
import swaggerUi from 'swagger-ui-express'
import swaggerJsdoc from 'swagger-jsdoc'
import { serviceProvider } from './saml/sp'
import { IdentityProvider } from 'saml2-js'
import fs from 'fs'

const app: Application = express();

const identityProvider = new IdentityProvider({
  sso_login_url: "http://localhost:4015/sso/login",
  sso_logout_url: "http://localhost:4015/sso/logout",
  certificates: [fs.readFileSync("./idp-cert.pem", "utf8")], // IdP Certificate
});

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

//logger
logger;

// Set the port, ensuring it’s a number or string
const port: string | number = envVars.APP_PORT || 4014;

// Define a basic route
app.get('/', (req: Request, res: Response): Response => {
  return successResponse(res, 200, {}, "Service Provider Service");
});

app.get('/sso/login', (req: Request, res: Response) => {
  serviceProvider.create_login_request_url(identityProvider, {}, (err, login_url) => {
    if (err) {
      console.error("Error creating login request URL:", err);
      return res.status(500).json({ error: "Failed to create login request" });
    }
    console.log("Redirecting to IdP login URL:", login_url);
    res.redirect(login_url);
  });
});

// Logout endpoint
// app.get('/logout', (req: Request, res: Response) => {
//   const user = req.user; // Assuming you store the user in the session

//   if (!user) {
//     return res.status(400).json({ error: 'No user session found' });
//   }

//   // Create a LogoutRequest
//   serviceProvider.create_logout_request_url(
//     identityProvider,
//     {
//       name_id: user.name_id, // NameID of the user
//       session_index: user.session_index, // Session index (if available)
//     },
//     (err, logoutUrl) => {
//       if (err) {
//         console.error('Error creating logout request:', err);
//         return res.status(500).json({ error: 'Logout failed' });
//       }

//       // Redirect the user to the IdP's logout endpoint
//       res.redirect(logoutUrl);
//     }
//   );
// });


// Handle SAML Assertion Consumer Service (ACS)
app.post('/sso/acs', (req: Request, res: Response) => {
  const { SAMLResponse } = req.body;

  console.log(`SAMLResponse from Identity Provider`, SAMLResponse)

  serviceProvider.post_assert(identityProvider, { request_body: { SAMLResponse } }, (err, response) => {
    if (err) {
      console.error("Error processing SAML response:", err);
      return res.status(401).json({ error: "SAML authentication failed" });
    }

    // Extract user data from SAML response
    const user_data = {
      name_id: response.user.name_id,
      attributes: response.user.attributes,
    };

    // Redirect to the appropriate app
    const app_url = "http://localhost:4014/dashboard"; // Example app URL
    console.log("Redirecting to app URL:", app_url);
    res.redirect(`${app_url}?user=${encodeURIComponent(JSON.stringify(user_data))}`);
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Service Provider is up and running on ${port}`);
  logger.info(`Service Provider is up and running on ${port}`);
});