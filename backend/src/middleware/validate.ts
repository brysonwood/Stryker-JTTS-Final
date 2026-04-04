import { Request, Response, NextFunction } from 'express';

// Validate body fields.
export function validateBody(requiredFields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const field of requiredFields) {
      const val = req.body[field];
      if (val === undefined || val === null || val === '') {
        return res.status(400).json({ error: `Field '${field}' is required` });
      }
    }
    return next();
  };
}
