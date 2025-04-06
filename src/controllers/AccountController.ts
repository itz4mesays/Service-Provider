import { retryTransaction } from "../utils/retry.transaction";
import { Request, Response } from "express";
import ProfileInterface from "../interfaces/profile.interface";
import { handleError, successResponse } from "../utils/responseHandler";
import { createIndividual, getUserByTaxId, getUserByVerificationCode, initialRegistration, singleInvididual, updateUserData } from "../services/account.service";
import { buildPaginationParams, generateRandomDigitNumber, generateStrongPassword, hashPassword } from "../utils/helpers";
import { $Enums, GenderTypes, IdentificationType, MaritalStatus, Prisma } from "@prisma/client";
import { buildCompleteSignupData, buildInitialRegData } from "../utils/form.helper";
import { EmailService } from "../services/email.service";
import { PaginatedResult } from "../utils/types";
import prisma from "../utils/client";
import { signupSchema, validateUserPayload } from "../validations/form_validations";
import { createAuthData, UserData } from "../handlers/idp.handler";

export default class AccountController implements ProfileInterface {
    registerIndividual = async (req: Request, res: Response): Promise<Response> => {
        try {
            const { error, value } = validateUserPayload.validate(req.body, { abortEarly: false })
            if (error)
                return handleError(res, 422, error.details[0].message)

            //check if tax id has already been registered
            const checkUser = await getUserByTaxId(value.tax_id)

            //Generate Verification Code - 15 digits
            const verification: string = generateRandomDigitNumber(15)

            //check if taxId has not been registered
            if (checkUser && checkUser.verification_code === null) {
                return handleError(res, 409, `This ${value.tax_id} has already been registered`)
            } else if (checkUser && checkUser.verification_code !== null) {
                //update verification code
                const updateVerifyCode = await updateUserData({
                    verification_code: verification
                }, checkUser.id)

                //Get Update user details
                return successResponse(res, 200, updateVerifyCode, "Please proceed to complete your signup process")
            }

            if (checkUser?.identification_value === value.identification_value)
                return handleError(res, 409, `${checkUser.identification_type} is already in use`)

            const prepData = buildInitialRegData(
                value,
                verification,
                "Individual",
                null
            )

            console.log(`Initial Data Prep`, prepData)
            const user = await initialRegistration(prepData)

            return successResponse(
                res,
                201,
                {
                    verification_code: verification
                },
                "You have successfully initiated your registration. Please complete your sign up process."
            )
        } catch (error) {
            return handleError(res, 500, error)
        }
    }

    registerBusiness = async (req: Request, res: Response): Promise<Response> => {
        try {
            return successResponse(res, 201, {}, "Business has been registered successfully")
        } catch (error) {
            return handleError(res, 500, error)
        }
    }

    completeSignup = async (req: Request, res: Response): Promise<Response> => {
        try {
            //validate form request
            const { error, value } = signupSchema.validate(req.body, { abortEarly: false })

            if (error)
                return handleError(res, 422, error.details[0].message);

            //check if verification code exist
            const user = await getUserByVerificationCode(value.verification_code)
            if (!user)
                return handleError(res, 404, "Sorry, we could not verify the verification code")

            //check if tax id matches
            if (user.tax_id !== value.tax_id)
                return handleError(res, 400, "Sorry, we are unable to verify your tax id as it does not match")

            let buildSignUpData = buildCompleteSignupData(value)
            const password = await generateStrongPassword({ includeSymbols: false })
            const temporaryPassword = await hashPassword(password, 10)

            //Integrate with IDP to update necessary details
            const payload: any = {
                tax_id: user.tax_id,
                password: temporaryPassword,
                date_of_birth: String(user.date_of_birth),
                role: user.role,
                tax_pay_type: user.identification_type as IdentificationType,
                identification_value: user.identification_value,
                email_address: value.email_address
            }

            const { status, data } = await createAuthData(payload)
            if (status === 200 || status === 201) {

                buildSignUpData = {
                    ...buildSignUpData,
                    identification_type: user.identification_type as IdentificationType,
                    identification_value: user.identification_value || "Not set"
                }

                // Send registration confirmation email
                await EmailService.sendRegistrationEmail({
                    email: value.email_address,
                    tax_id: value.tax_id,
                    password: password // Use temporary password if available
                });

                const result = await retryTransaction(async (tx) => {
                    const individual = await createIndividual(buildSignUpData)

                    //update verfication code
                    await prisma.user.update({
                        where: { tax_id: value.tax_id },
                        data: {
                            verification_code: null
                        }
                    })
                    return individual
                })

                return successResponse(
                    res,
                    200,
                    result,
                    "Congratulation, your registration has been completed"
                )

            }

            return handleError(res, 400, "Sorry an error occured. Please try again")
        } catch (error) {
            return handleError(res, 500, error)
        }
    }

    getAllIndividuals = async (req: Request, res: Response): Promise<Response> => {
        try {
            const queryParams = buildPaginationParams(res, req)
            const search = queryParams.search

            // Extract valid enum values for filtering
            const validGender = Object.values(GenderTypes);
            const validMaritalStatus = Object.values(MaritalStatus);

            // Define filters for gender and marital status
            const genderSearcch = search && validGender.includes(search as GenderTypes)
                ? { gender: { equals: search as GenderTypes } }
                : undefined;

            const maritalSearch = search && validMaritalStatus.includes(search as MaritalStatus)
                ? { marital_status: { equals: search as MaritalStatus } }
                : undefined;

            // Define the base where clause
            const whereClause: Prisma.IndividualWhereInput = {
                AND: [
                    // Always include this (no conditions)
                    {},
                    // Only apply these if search is provided
                    ...(search ? [
                        {
                            OR: [
                                { tax_id: { contains: search } },
                                { firstname: { contains: search } },
                                { surname: { contains: search } },
                                { business_type: { contains: search } },
                                { email_address: { contains: search } },
                                { occupation: { contains: search } },
                                ...(genderSearcch ? [genderSearcch] : []),
                                ...(maritalSearch ? [maritalSearch] : []),
                            ].filter(Boolean)
                        }
                    ] : [])
                ]
            };

            // Define the query options
            const options: Prisma.IndividualFindManyArgs = {
                select: {
                    id: true,
                    tax_id: true,
                    firstname: true,
                    surname: true,
                    othernames: true,
                    gender: true,
                    marital_status: true,
                    email_address: true,
                    phone_number: true,
                    date_of_birth: true,
                    kaadi_igbeayo_no: true,
                    business_type: true,
                    created_at: true,
                },
                take: queryParams.records_per_page,
                skip: queryParams.offset,
                orderBy: {
                    created_at: Prisma.SortOrder.desc,
                },
                where: whereClause,
            };

            // Fetch total records and paginated gigs
            const totalRecords = await prisma.individual.count({ where: whereClause });
            const individuals = await prisma.individual.findMany(options);
            const pages = Math.ceil(totalRecords / queryParams.records_per_page);

            // Define pagination result
            const pagination: PaginatedResult = {
                total: totalRecords,
                current: queryParams.current_page,
                from: queryParams.offset + 1,
                to: Math.min(queryParams.offset + queryParams.records_per_page, totalRecords),
                pages: pages,
            };

            // Return success response
            return successResponse(res, 200, { individuals, pagination }, "Individuals records retrieved successfully");

        } catch (error) {
            return handleError(res, 500, error)
        }
    }

    getSingleIndividual = async (req: Request, res: Response): Promise<Response> => {
        try {
            const { type, value } = req.query
            if (!type && !value)
                return handleError(res, 400, "Sorry, type and value parameters are missing from the route")

            // Validate the type parameter
            if (type !== 'tax_id' && type !== 'id')
                return handleError(res, 400, "The type parameter must be either 'tax_id' or 'id'");

            const individual = await singleInvididual(type, value)

            if (!individual)
                return handleError(res, 404, "Sorry, we could not find any associated record")

            return successResponse(res, 200, individual, "Single Individual has been fetched")
        } catch (error) {
            return handleError(res, 500, error)
        }
    }
}
