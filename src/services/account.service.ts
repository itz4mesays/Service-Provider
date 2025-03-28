import prisma from "../utils/client"

export const getUserByEmail = async (email: string) => {
    return await prisma.user.findUnique({
        where: { email: email }
    })
}

export const createUserAuthDetails = async (obj: any) => {
    return await prisma.user.create({
        data: obj
    })
}

export const createUserProfile = async (obj: any) => {
    return await prisma.userProfile.create({
        data: obj
    })
}