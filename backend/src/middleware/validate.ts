import { Request, Response, NextFunction } from 'express';

// Return 400 if any required body fields are missing or blank.
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
