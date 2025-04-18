import express, { Request, Response, Router } from 'express'
import { handleError, successResponse } from '../utils/responseHandler';
import { idpConfig, spConfig } from '../config/config';
import { createLoginRequest, createManualLoginRequest, CustomSessionData, sp, validateCertificates } from '../config/saml';
import { parseString, parseStringPromise } from 'xml2js';
import fs from 'fs'
import dotenv from 'dotenv'
import { IdentityProvider } from 'saml2-js';
import envVars from '../validations/validateEnv';
import { signJwt } from '../utils/helpers';
import prisma from '../utils/client';
dotenv.config()

const router: Router = express.Router();

// Route to initiate the login process (SP)
router.get('/sp/login', (req: Request, res: Response) => {
  // 1. Configure Identity Provider
  const idp = {
    sso_login_url: `${envVars.IDENTITY_PROVIDER_URL}/saml/idp/login`,
    certificates: [fs.readFileSync('./idp-cert.pem')],
  };

  // 2. Set login options for SAML request
  const options = {
    relay_state: req.query.redirect_uri?.toString() || '/dashboard', // The URL to redirect to after successful login
    authn_context: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport', // Auth context for password-based login
    force_authn: false, // Set this to true if you want the IdP to force authentication even if the user is already logged in
  };

  // 3. Create SAML authentication request
  sp.create_login_request_url(idp, options, (err: Error | null, login_url: string, request_id: string) => {
    if (err) {
      console.error('SAML Login Error:', err);
      return res.status(500).render('error', { message: 'SAML authentication failed to initialize' });
    }

    // 4. Create the raw SAML XML request
    const samlRequest = `<?xml version="1.0" encoding="UTF-8"?>
    <samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      ID="${request_id}"
      Version="2.0"
      IssueInstant="${new Date().toISOString()}"
      Destination="${idp.sso_login_url}"
      ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect">
      <saml:Issuer>${envVars.SERVICE_PROVIDER_URL}</saml:Issuer>
      <samlp:NameIDPolicy AllowCreate="true" Format="urn:oasis:names:tc:SAML:2.0:nameid-format:transient"/>
    </samlp:AuthnRequest>`;

    // Log the raw SAMLRequest XML
    console.log("Raw SAMLRequest XML:", samlRequest);

    // 5. Base64 encode the SAML request
    const base64EncodedRequest = Buffer.from(samlRequest).toString('base64');
    console.log("Base64 Encoded SAMLRequest:", base64EncodedRequest);

    // 6. URL encode the Base64 encoded SAMLRequest
    const urlEncodedRequest = encodeURIComponent(base64EncodedRequest);
    console.log("URL Encoded SAMLRequest:", urlEncodedRequest);

    // 7. Store the SAML request information in the session
    (req.session as unknown as CustomSessionData).saml = {
      requestId: request_id,
      // You can dynamically set the nameId here, if needed
      nameId: null,  // This is a placeholder, set dynamically based on your authentication flow
    };

    // Log session data for debugging
    console.log('Session Details:', req.session);

    // 8. Save the session and redirect the user to the IdP login URL
    req.session.save(() => {
      // Construct the login URL with the SAMLRequest and RelayState as query parameters
      const samlLoginUrl = `${idp.sso_login_url}?SAMLRequest=${urlEncodedRequest}&RelayState=${req.query.redirect_uri?.toString() || '/dashboard'}`;
      res.redirect(samlLoginUrl); // Send the user to the IdP login page
    });
  });
});

// Expose SP metadata
router.get('/sp/metadata', (req: Request, res: Response) => {
  try {
    res.type('application/xml');
    res.send(sp.create_metadata());
  } catch (error) {
    console.error('Failed to serve SP metadata:', error);
    res.status(500).send('Metadata generation failed');
  }
});

//Check Configuration
router.get('/sp/config-check', (req: Request, res: Response) => {
  res.json({
    spConfig: {
      ...spConfig,
      certificate: spConfig.certificate?.substring(0, 50) + '...',
      private_key: spConfig.private_key?.substring(0, 50) + '...'
    },
    idpConfig: {
      ...idpConfig,
      certificate: idpConfig.certificate?.substring(0, 50) + '...'
    }
  });
});

router.get('/sp/logout', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) return handleError(res, 401, "Unauthorized")
    await prisma.blackListedToken.create({
      data: { token }
    })

    return successResponse(res, 200, {}, "Logout successful")
  } catch (error) {
    return handleError(res, 500, error)
  }
});

router.post('/sp/acs', express.urlencoded({ extended: true }), async (req: Request, res: Response) => {
  const { SAMLResponse, RelayState } = req.body;

  // console.log(`I received SAML response from ${envVars.IDENTITY_PROVIDER_URL}`, SAMLResponse);

  if (!SAMLResponse) {
    return handleError(res, 400, 'SAML Response is required')
  }

  try {
    // Decode the base64-encoded SAML Response
    const decodedSamlResponse = Buffer.from(SAMLResponse, 'base64').toString('utf-8').trim();

    // Check for any unwanted characters before the XML start tag
    if (!decodedSamlResponse.startsWith('<?xml version')) {
      return handleError(res, 400, 'Invalid SAML Response format: Does not start with <?xml version')
    }

    // Optionally, parse the decoded XML
    const parsedSamlResponse = await parseStringPromise(decodedSamlResponse);

    // Log the parsed response to inspect its structure
    // console.log('Parsed SAML Response:', JSON.stringify(parsedSamlResponse, null, 2));

    // Extract the attributes from the AttributeStatement
    const attributes = parsedSamlResponse?.Response?.Assertion?.[0]?.AttributeStatement?.[0]?.Attribute;

    if (!attributes) {
      return handleError(res, 400, 'Attributes are missing from the SAML Response')
    }

    // Initialize the user object to store extracted values
    const user: Record<string, string> = {};

    // Loop through attributes to map values
    attributes.forEach((attribute: any) => {
      const attributeName = attribute?.$.Name;
      const attributeValue = attribute?._;  // Access the value using the _ property

      console.log(`Attribute Name: ${attributeName}, Attribute Value: ${attributeValue}`);  // Log values for debugging

      if (attributeName === 'TaxId') {
        user.tax_id = attributeValue;
      } else if (attributeName === 'EmailAddress') {
        user.email_address = attributeValue;
      } else if (attributeName === 'Role') {
        user.role = attributeValue;
      } else if (attributeName === 'NameId') {
        user.nameid = attributeValue;
      }
    });

    console.log(`User response from ${envVars.IDENTITY_PROVIDER_URL}`, user);

    if (!user.email_address || !user.tax_id) {
      return handleError(res, 400, 'User information is incomplete in the SAML Response')
    }


    const token = await signJwt({
      id: user.tax_id,  // Or another identifier if needed
      email_address: user.email_address,
      tax_id: user.tax_id,
      role: user.role,
      nameid: user.nameid
    })

    return successResponse(res, 200, {
      token,
      expiresIn: envVars.JWT_EXPIRY,
      user: {
        tax_id: user.tax_id,
        email_address: user.email_address,
        role: user.role
      }
    }, "SAML Response processed successfully");
  } catch (err) {
    console.error('Error processing SAML Response:', err);
    return handleError(res, 500, 'Error processing the SAML Response')
  }
});

router.get('/dashboard', async (req: Request, res: Response) => {
  res.send('Dashboard')
})

export default router