import fs from 'fs';
import path from 'path';
import envVars from '../validations/validateEnv';

// Get directory path where config.ts resides
const CURRENT_DIR = __dirname;

export const loadCert = (filename: string): string => {
    const certPath = path.resolve(CURRENT_DIR, '../../', filename);
    const content = fs.readFileSync(certPath, 'utf8');

    if (!content.includes('-----BEGIN CERTIFICATE-----')) {
        throw new Error(`Invalid CERTIFICATE format in ${filename}`);
    }
    return content;
}

function base64ToPem(base64String: string): string {
    // Remove any existing whitespace/newlines
    const cleanBase64 = base64String.trim()
        .replace(/-/g, '+')  // URL-safe Base64
        .replace(/_/g, '/')
        .replace(/\s/g, '');

    return `-----BEGIN CERTIFICATE-----\n` +
        `${cleanBase64.match(/.{1,64}/g)?.join('\n')}\n` +
        `-----END CERTIFICATE-----\n`;
}

function pemToBase64(pemString: string): string {
    return pemString
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s/g, '');
}

function loadPrivateKey(filename: string): string {
    const keyPath = path.resolve(CURRENT_DIR, '../../', filename);
    const content = fs.readFileSync(keyPath, 'utf8');

    // Accept both RSA and EC private key formats
    if (!content.includes('-----BEGIN PRIVATE KEY-----') &&
        !content.includes('-----BEGIN RSA PRIVATE KEY-----')) {
        throw new Error(`Invalid PRIVATE KEY format in ${filename}`);
    }
    return content;
}

export interface SpConfig {
    entity_id: string;
    private_key: string;
    certificate: string;
    assert_endpoint: string;
    force_authn: boolean;
    auth_context: any
}

export interface IdpConfig {
    sso_url: string;
    certificate: string;
}

export const spConfig: SpConfig = {
    entity_id: `${envVars.SERVICE_PROVIDER_URL}/saml/sp`,
    private_key: loadPrivateKey('sp-private-key.pem').toString(), // Use private key loader
    certificate: loadCert('meta-cert.pem').toString(),
    assert_endpoint: `${envVars.SERVICE_PROVIDER_URL}/saml/sp/acs`,
    force_authn: false,
    auth_context: { comparison: "exact", class_refs: ["urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport"] }
};

export const idpConfig: IdpConfig = {
    sso_url: `${envVars.IDENTITY_PROVIDER_URL}/saml/idp/login`,
    certificate: loadCert('idp-cert.pem')
};