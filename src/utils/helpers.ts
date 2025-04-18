import { Response, Request, NextFunction } from 'express';
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { JwtPayload } from './types';
import envVars from '../validations/validateEnv';
import { handleError } from './responseHandler';
import prisma from './client';
import { User } from '@prisma/client';

interface CustomRequest extends Request {
    user?: User;
}

export const hashPassword = async (new_password: string, saltVaue: number): Promise<string> => {
    // Hash the new password
    return await bcrypt.hash(new_password, saltVaue)
}

export const generateRandomDigitNumber = (length: number): string => {
    return String(Math.floor(Math.random() * 1e15)).padStart(length, '0');
}

export const generateVerificationCode = (length: number): string => {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const range = max - min + 1;

    // Generate a secure random integer within the range
    const randomInt = crypto.randomInt(range) + min;

    return randomInt.toString();
}

/**
 * Generates a strong random password with configurable options
 * @param options Configuration options for password generation
 * @returns Generated password string
 * const password = generateStrongPassword({ includeSymbols: false }); Simpler
 * const password = generateStrongPassword({ length: 16 }); longer
 * const pin = generateStrongPassword({
  length: 6,
  includeLowercase: false,
  includeUppercase: false,
  includeSymbols: false
}); Numeric pin
 */
export const generateStrongPassword = async (options: {
    length?: number;          // Default: 12
    includeNumbers?: boolean; // Default: true
    includeSymbols?: boolean; // Default: true
    includeUppercase?: boolean; // Default: true
    includeLowercase?: boolean; // Default: true
} = {}): Promise<string> => {
    // Set defaults
    const {
        length = 12,
        includeNumbers = true,
        includeSymbols = true,
        includeUppercase = true,
        includeLowercase = true
    } = options;

    // Character sets
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    // Validate options
    if (length < 8) throw new Error('Password length must be at least 8 characters');
    if (!includeLowercase && !includeUppercase && !includeNumbers && !includeSymbols) {
        throw new Error('At least one character type must be included');
    }

    // Build character pool based on options
    let charPool = '';
    if (includeLowercase) charPool += lowercase;
    if (includeUppercase) charPool += uppercase;
    if (includeNumbers) charPool += numbers;
    if (includeSymbols) charPool += symbols;

    // Generate password
    const passwordArray = [];
    // const crypto = window.crypto || (window as any).msCrypto; // For browser compatibility
    const randomValues = new Uint32Array(length);

    if (crypto && crypto.getRandomValues) {
        crypto.getRandomValues(randomValues);
    } else {
        // Fallback for environments without crypto (not cryptographically secure)
        for (let i = 0; i < length; i++) {
            randomValues[i] = Math.random() * 4294967296;
        }
    }

    for (let i = 0; i < length; i++) {
        passwordArray.push(charPool[randomValues[i] % charPool.length]);
    }

    // Ensure at least one character from each selected set is included
    const password = passwordArray.join('');
    const checks = [
        includeLowercase && /[a-z]/.test(password),
        includeUppercase && /[A-Z]/.test(password),
        includeNumbers && /[0-9]/.test(password),
        includeSymbols && /[^a-zA-Z0-9]/.test(password)
    ].filter(Boolean);

    if (checks.every(Boolean) || password.length < 8) {
        return password;
    }

    // If any character type is missing, regenerate those characters
    const newPassword = password.split('');
    if (includeLowercase && !/[a-z]/.test(password)) {
        newPassword[0] = lowercase[Math.floor(Math.random() * lowercase.length)];
    }
    if (includeUppercase && !/[A-Z]/.test(password)) {
        newPassword[1] = uppercase[Math.floor(Math.random() * uppercase.length)];
    }
    if (includeNumbers && !/[0-9]/.test(password)) {
        newPassword[2] = numbers[Math.floor(Math.random() * numbers.length)];
    }
    if (includeSymbols && !/[^a-zA-Z0-9]/.test(password)) {
        newPassword[3] = symbols[Math.floor(Math.random() * symbols.length)];
    }

    return newPassword.join('');
}

export const buildPaginationParams = (res: Response, req: Request) => {
    const records_per_page: number = Number(req.query.records_per_page) || 20;
    const current_page: number = Number(req.query.current_page) || 1;
    const search: string | null = typeof req.query.search === "string" ? req.query.search : null;
    const offset: number = (current_page - 1) * records_per_page;

    return {
        records_per_page,
        current_page,
        search,
        offset
    }
}

export const sanitizePem = (pem: string): string => {
    return pem
        .trim()
        .replace(/\r\n/g, '\n')  // Normalize line endings
        .replace(/-{5}(BEGIN|END) [A-Z ]+-{5}/g, match => match.trim())  // Clean headers
        .replace(/\n+/g, '\n')   // Remove empty lines
        + '\n';  // Ensure trailing newline
}

export const signJwt = async (user: JwtPayload) => {
    return jwt.sign(
        {
            id: user.tax_id,
            email_address: user.email_address,
            tax_id: user.tax_id,
            role: user.role,
            nameid: user.nameid
        },
        envVars.JWT_SECRET as string, // use a secure env-based secret
        { expiresIn: envVars.JWT_EXPIRY } // token expiration time
    )
}

export const jwtVerify = async (req: CustomRequest, res: Response, next: NextFunction) => {
    const referer = req.headers['referer'] || '';
    const authorizationHeader = req.headers['authorization'];

    if (referer.includes('api-docs')) {
        // This is for requests coming from Swagger UI
        next();
    } else {
        if (!authorizationHeader) {
            return handleError(res, 401, "Missing bearer token from the header")
        } else {
            const tokenParts = authorizationHeader.split('Bearer');
            if (tokenParts.length !== 2) {
                return handleError(res, 400, "Invalid authorization header format.")
            }
            const token = tokenParts[1].trim();

            try {
                const isTokenRevoked = await prisma.blackListedToken.findFirst({
                    where: { token }
                })

                if (isTokenRevoked) {
                    return handleError(res, 401, "Session expired. Please login again!")
                }

                jwt.verify(token, envVars.JWT_SECRET as string, (err, decoded) => {
                    if (err) {
                        return handleError(res, 401, "Session expired. Please login!")
                    }
                    req.user = decoded as User;

                    console.log(`Decoded User`, req.user)

                    next();
                });
            } catch (error) {
                console.error('Error verifying token:', error);
                return handleError(res, 500, "An error occured while processing your request")
            }
        }
    }
};
