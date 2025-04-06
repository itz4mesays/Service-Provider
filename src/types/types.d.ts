// types.d.ts
declare module 'saml2-js' {
    interface ServiceProviderOptions {
        idp_sso_url?: string;
        idp_cert?: string;
    }
}