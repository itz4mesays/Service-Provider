declare module 'saml2-js' {
    interface ServiceProviderOptions {
        entity_id: string;
        private_key: string;
        certificate: string;
        assert_endpoint: string;
        idp_sso_url: string;
        idp_cert: string;
    }
}

declare module 'saml2-js' {
    interface SAMLAttributes {
        id?: string[];
        email_address?: string[];
        role?: string[];
        tax_id?: string[];
        identification_type?: string[];
        identification_value?: string[];
    }

    interface SAMLAssertResponse {
        user?: {
            attributes?: SAMLAttributes;
        };
    }
}