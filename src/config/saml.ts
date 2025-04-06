import { ServiceProvider } from 'saml2-js';
import { spConfig, idpConfig, loadCert } from './config';
import path from 'path'
import envVars from '../validations/validateEnv';
import { promisify } from 'util';
import zlib, { deflateRawSync } from 'zlib';
import { encode } from 'base64-url';
import { SamlRequestResult } from '../utils/types';
import { Request, Response } from 'express'
import { URL } from 'url';
import { ParsedQs } from 'qs';

export interface CustomSessionData {
    saml: {
        requestId: string;
        [key: string]: any;
    };
    user?: any;
}

const deflate = promisify(zlib.deflateRaw);

// Debug helper to validate certificates
function validateCertificate(cert: string) {
    if (!cert.includes('BEGIN CERTIFICATE') || !cert.includes('END CERTIFICATE')) {
        throw new Error('Invalid certificate format');
    }
}

function validatePem(pem: string, type: 'CERTIFICATE' | 'PRIVATE KEY') {
    const begin = `-----BEGIN ${type}-----`;
    const end = `-----END ${type}-----`;

    if (!pem.includes(begin) || !pem.includes(end)) {
        throw new Error(`Invalid ${type} format`);
    }

    // Check for proper line breaks
    if (!pem.includes('\n')) {
        throw new Error(`${type} must contain explicit newlines (\\n)`);
    }
}

// Run during startup
validatePem(spConfig.private_key, 'PRIVATE KEY');
validatePem(spConfig.certificate, 'CERTIFICATE');
validatePem(idpConfig.certificate, 'CERTIFICATE');

function validateCertificateChain() {
    // Extract base64 certificate from metadata (use the full value from your XML)
    const metaCertPem = loadCert('meta-cert.pem')// Full certificate from <ds:X509Certificate>

    // Normalize both certificates for comparison
    const normalizeCert = (cert: string) => {
        return cert
            .replace(/-----BEGIN CERTIFICATE-----/g, '')
            .replace(/-----END CERTIFICATE-----/g, '')
            .replace(/\s/g, '')
            .trim();
    };

    const normalizedConfig = normalizeCert(spConfig.certificate);
    const normalizedMeta = normalizeCert(metaCertPem);

    console.log('Certificate lengths:', {
        config: normalizedConfig.length,
        meta: normalizedMeta.length
    });

    if (normalizedConfig !== normalizedMeta) {
        console.error('Certificate mismatch details:', {
            configStart: normalizedConfig.substring(0, 30),
            metaStart: normalizedMeta.substring(0, 30),
            configEnd: normalizedConfig.slice(-30),
            metaEnd: normalizedMeta.slice(-30)
        });
        throw new Error('SP certificate does not match metadata');
    }
    console.log('✅ Certificates match perfectly');
}

validateCertificateChain();

// Initialize Service Provider with proper error handling
export const sp = (() => {
    try {
        // Add this debug code before creating the SP
        console.log('Full IDP Certificate Length:', idpConfig.certificate.length);
        console.log('Full SP Certificate Length:', spConfig.certificate.length);
        console.log('SP Private Key Length:', spConfig.private_key.length);

        return new ServiceProvider({
            entity_id: spConfig.entity_id,
            private_key: spConfig.private_key,
            certificate: spConfig.certificate,
            assert_endpoint: spConfig.assert_endpoint,
            auth_context: {
                comparison: "exact",
                class_refs: ["urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport"]
            },
            allow_unencrypted_assertion: true
        } as any);
    } catch (err: any) {
        console.error('SP Initialization Error Details:', {
            error: err.message,
            stack: err.stack,
            certificatePaths: {
                spKey: path.resolve(__dirname, '../sp-private-key.pem'),
                spCert: path.resolve(__dirname, '../sp-cert.pem'),
                idpCert: envVars.IDP_CERTIFICATE_B64
            }
        });
        process.exit(1);
    }
})();


export async function createLoginRequest(): Promise<string> {
    // 1. Generate SAML AuthnRequest XML manually
    const samlXml = await new Promise<string>((resolve, reject) => {
        (sp as any).create_authn_request_xml(
            {
                sso_url: idpConfig.sso_url,
                force_authn: false,
                nameid_format: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
            },
            (err: Error, xml: string) => err ? reject(err) : resolve(xml)
        );
    });

    // 2. Compress and encode manually
    const deflated = deflateRawSync(Buffer.from(samlXml));
    const base64 = encode(deflated.toString('base64'));

    // 3. Build the redirect URL
    return `${idpConfig.sso_url}?SAMLRequest=${base64}&RelayState=${encodeURIComponent('/')}`;
}

export function createManualLoginRequest(
    sp: any,
    idpConfig: any,
    binding: 'redirect' | 'post' = 'redirect'
): SamlRequestResult {
    // 1. Generate raw SAML XML (keep your working version)
    const samlXml = sp.create_authn_request_xml({
        sso_url: idpConfig.sso_url,
        force_authn: false,
        nameid_format: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
    });

    // 2. Prepare encoding based on binding type
    if (binding === 'post') {
        console.log(`This is a post request`)
        // For POST binding - no compression, plain base64
        const base64 = Buffer.from(samlXml).toString('base64');
        return {
            type: 'post',
            form: `<!DOCTYPE html>
            <html>
            <body onload="document.forms[0].submit()">
                <form method="post" action="${idpConfig.sso_url}">
                    <input type="hidden" name="SAMLRequest" value="${base64}" />
                    <input type="hidden" name="RelayState" value="/" />
                    <noscript>
                        <input type="submit" value="Continue to Login" />
                    </noscript>
                </form>
            </body>
            </html>`
        };
    } else {
        console.log(`This is a get request`)

        // For HTTP-Redirect binding (your existing working version)
        const deflated = deflateRawSync(Buffer.from(samlXml));
        const base64 = encode(deflated.toString('base64'));
        return {
            type: 'redirect',
            url: `${idpConfig.sso_url}?SAMLRequest=${base64}&RelayState=${encodeURIComponent('/')}`
        };
    }
}

export function validateCertificates(spConfig: any, idpConfig: any) {
    const requiredCertificates = [
        { name: 'SP Private Key', content: spConfig.private_key },
        { name: 'SP Certificate', content: spConfig.certificate },
        { name: 'IDP Certificate', content: idpConfig.certificate }
    ];

    requiredCertificates.forEach(cert => {
        if (!cert.content.includes('-----BEGIN') || !cert.content.includes('-----END')) {
            throw new Error(`Invalid ${cert.name} format`);
        }
    });
}

export const createLoginUrl = async (req: Request): Promise<string> => {
    return new Promise((resolve, reject) => {
        sp.create_login_request_url(
            {
                sso_login_url: idpConfig.sso_url!,
                certificates: [idpConfig.certificate!],
                allow_unencrypted_assertion: false
            },
            {
                relay_state: validateRedirectUrl(req.query.redirect_uri as string | undefined),
                auth_context: {
                    class_refs: [
                        req.query.high_security === 'true'
                            ? 'urn:oasis:names:tc:SAML:2.0:ac:classes:HardwareToken'
                            : 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport'
                    ],
                    comparison: 'exact'
                },
                nameid_format: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
            },
            (err: any, url: string, requestId: string) => {
                if (err) return reject(err);

                // This will now work
                (req.session as unknown as CustomSessionData).saml = { requestId };

                resolve(url);
            }
        );
    });
};

// Extended version with security checks
export function validateRedirectUrl(
    input: string | ParsedQs | string[] | undefined,
    allowedDomains: string[] = ['localhost']
): string {
    // Convert input to string
    let url: string | undefined;

    if (typeof input === 'string') {
        url = input;
    } else if (Array.isArray(input)) {
        url = input[0]; // Take first array element
    } else if (input && typeof input === 'object') {
        url = Object.values(input)[0]?.toString(); // Handle ParsedQs
    }

    if (!url) return '/'; // Default fallback

    // Rest of your validation logic...
    try {
        const parsed = new URL(url, 'http://localhost');
        return parsed.pathname; // Or full URL if valid
    } catch {
        return '/';
    }
}
