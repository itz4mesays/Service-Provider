import { ServiceProvider } from 'saml2-js'
import fs from 'fs'

// SAML Service Provider (SP) configuration
export const serviceProvider = new ServiceProvider({
    entity_id: "http://localhost:4014",
    private_key: fs.readFileSync("./sp-key.pem", "utf8"), // SP Private Key
    certificate: fs.readFileSync("./sp-cert.pem", "utf8"), // SP Certificate
    assert_endpoint: "http://localhost:4014/sso/acs",
});