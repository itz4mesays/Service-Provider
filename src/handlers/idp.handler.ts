
import axios from "axios";
import { logger } from "../utils/logger";
import envVars from "../validations/validateEnv";
import https from 'https'
import { IdentificationType } from "@prisma/client";

const agent = new https.Agent({
    rejectUnauthorized: false, // Ignore certificate errors
});

export interface UserData {
    tax_id: string
    password: string
    date_of_birth: string
    role: string
    tax_pay_type: IdentificationType
    identification_value: string
    email_address: string
}

export const createAuthData = async (objData: UserData) => {
    const url = `${envVars.IDENTITY_PROVIDER_URL}/api/v1/auth/create-auth-data`
    try {
        // Make the PATCH request to the API
        const response = await axios.patch(url, objData, {
            headers: {
                'Content-Type': 'application/json'
            },
            httpsAgent: agent
        });

        const { status, data } = response;
        console.log(`Response while create auth data on ${envVars.IDENTITY_PROVIDER_URL} for ${objData.tax_id}: ${response}`)
        return { status, data };
    } catch (error) {
        logger.error(`Error while creating authentication data for ${objData.tax_id}`, error)
        throw error;
    }
}