import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { handleError } from '../utils/responseHandler';

const ensureAdmin = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer '))
        return handleError(res, 401, 'Unauthorized: Missing token')

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
        console.log(`User role is `, decoded.role)
        if (decoded.role !== 'Admin') {
            return handleError(res, 403, 'You are not authorized to access this resource')
        }

        (req as any).user = decoded;
        next();
    } catch (err) {
        return handleError(res, 401, 'Unauthorized: Invalid token')
    }
};

export default ensureAdmin;
