import Joi from 'joi'

// Define the schema for validation
const envSchema: Joi.ObjectSchema = Joi.object({
    APP_PORT: Joi.number().required(),
    NODE_ENV: Joi.string().required(),
    SERVICE_PROVIDER_URL: Joi.string().required(),
    IDP_CERTIFICATE_B64: Joi.string().required(),
    IDENTITY_PROVIDER_URL: Joi.string().required(),
    SESSION_SECRET: Joi.string().required(),
    ENCRYPTION_KEY: Joi.string().required(),
})
    .unknown() // Allow additional environment variables not specified in the schema
    .required();

// Validate the environment variables against the schema
const { error, value: envVars } = envSchema.validate(process.env, {
    abortEarly: true, // Return all errors found
});

// If validation fails, throw an error and exit
if (error) {
    throw new Error(`Environment variable validation error: ${error.details[0].message}`)
    process.exit(1); // Exit the process with an error code
}

// If validation is successful, you can safely use envVars
export default envVars;