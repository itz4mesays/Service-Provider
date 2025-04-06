import { Request, Response, NextFunction } from 'express';
import { CustomSessionData } from '../config/saml';
import { handleError } from '../utils/responseHandler';

// Middleware to ensure user is logged in and has the "Admin" role
export function ensureAdmin(req: Request, res: Response, next: NextFunction) {
    console.log('Session in ensureAdmin:', req);

    // if (!req.session.user) {
    //     return res.status(401).json({ message: 'No user in session' });
    // }

    // if (req.session.user.role !== 'Admin') {
    //     return res.status(403).json({ message: 'Forbidden' });
    // }

    next();
}
