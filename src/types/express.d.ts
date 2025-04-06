// src/types/express-session.d.ts
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    saml?: {
      requestId: string;
      nameId?: string;
      sessionIndex?: string;
    };
    user?: {
      id: string;
      email_address: string;
      tax_id: string;
      role: string;
    };
  }
}