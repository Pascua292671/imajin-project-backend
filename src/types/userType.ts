// Updated user data types with better naming and role support


export type UserRole = "Customer" | "Artist" | "Sessionist" | "Organizer";
export type UserStatus = "active" | "inactive" | "suspended" | "pending_verification" | "verified" | "rejected"
export interface UserRolesResponse {
    success: boolean
    message?: string
    data?: {
        user_id: string
        username: string
        email: string
        roles: UserRole[]
        current_role: UserRole
        status: UserStatus
        can_switch_roles: boolean
        email_verified: boolean
        phone_verified: boolean
        profile_image?: string | null
        avatar?: string | null
        bio?: string | null
        created_at: Date
        updated_at: Date
        personal_info: {
            full_name?: string | null
            first_name?: string | null
            middle_name?: string | null
            last_name?: string | null
            username: string
            email: string
            phone_number?: string | null
            profile_image?: string | null
        }
        address_information?: {
            address?: string | null
            street?: string | null
            zip_code?: string | null
            barangay?: string | null
            province?: string | null
            region?: string | null
            country?: string | null
            city?: {
                id: string
                name: string
            } | null
        }
        identification_info: {
            has_valid_documents: boolean
            documents: Array<{
                document_type: string
                id_type?: string | null
                id_number?: string | null
                file_url: string
                is_verified: boolean
            }>
        }
        business_info?: {
            business_type?: string | null
            business_name?: string | null
            business_description?: string | null
            business_phone_number?: string | null
            business_telephone?: string | null
            business_email?: string | null
            terms_and_conditions?: string | null
            is_verified: boolean
            business_address?: {
                business_address?: string | null
                street?: string | null
                barangay?: string | null
                city?: {
                    id: string
                    name: string
                } | null
                province?: string | null
                region?: string | null
                zip_code?: string | null
                country?: string | null
            }
            documents?: {
                upload_dti_certificate?: string | null
                upload_business_permit?: string | null
                upload_storefront_photo?: string | null
            }
        }
    }
}

export interface SwitchRoleRequest {
    targetRole: UserRole
}

export interface SwitchRoleResponse {
    success: boolean
    message: string
    data?: {
        current_role: UserRole
        available_roles: UserRole[]
        status: UserStatus
    }
}

export interface UserDataResponse {
    success: boolean
    message: string
    data?: {
        user_id: string
        username: string
        email: string
        roles: UserRole[]
        current_role: UserRole
        status: UserStatus
        can_switch_roles: boolean
        personal_info: {
            full_name?: string | null
            first_name?: string | null
            middle_name?: string | null
            last_name?: string | null
            username: string
            phone_number?: string | null
            profile_image?: string | null
            profile_background?: string | null
            bio?: string | null
        }
        address_information?: {
            street?: string | null
            zip_code?: string | null
            barangay?: string | null
            province?: string | null
            region?: string | null
            country?: string | null
            city?: {
                id: string
                name: string
            } | null
        }
        identification_info: {
            has_valid_documents: boolean
            documents: Array<{
                document_type: string
                id_type?: string | null
                id_number?: string | null
                file_url: string
                is_verified: boolean
            }>
        }
        business_info?: {
            business_name?: string | null
            business_description?: string | null
            business_type?: "INDIVIDUAL" | "STORE" | null
            business_phone_number?: string | null
            business_telephone?: string | null
            business_email?: string | null
            is_verified: boolean
            business_address?: {
                business_address?: string | null
                street?: string | null
                barangay?: string | null
                city?: {
                    id: string
                    name: string
                } | null
                province?: string | null
                region?: string | null
                zip_code?: string | null
                country?: string | null
            }
            documents?: {
                upload_dti_certificate?: string | null
                upload_business_permit?: string | null
                upload_storefront_photo?: string | null
            }
            terms_and_conditions?: string | null
        }
    }
}

export interface SignInCredentials {
    email: string
    password: string
}

export interface AuthResponse {
    success: boolean
    message: string
    idToken?: string
    customToken?: string
    user?: UserDataResponse["data"]
}

export interface SignUpResponse {
    success: boolean
    message: string
    data?: {
        user: {
            id: string
            email: string
            fullName: string
        }
        tokens?: {
            accessToken: string
            refreshToken: string
        }
    }
}

export interface SignUpError {
    message: string
    errors?: Record<string, string[]>
}

export interface ProfileUpdateResponse {
    status: "success"
    code: "PERSONAL_INFO_UPDATED"
    message: string
    data: {
        user: UserDataResponse["data"]
    }
}

export interface UserPersonalInfoFormData {
    first_name: string
    middle_name?: string
    last_name: string
    username: string
    email: string
    phone_number: string
    bio?: string
    street?: string
    barangay?: string
    zip_code?: string
    country?: string
    region?: string
    province?: string
    city?: {
        id: string
        name: string
    }
}

export interface LenderPersonalInfoFormData extends UserPersonalInfoFormData {
    business_name: string
    business_type?: string
    business_registration_number?: string
    business_address?: string
    business_phone_number?: string
}

export interface UpdatePersonalInfoResponse {
    status: "success" | "error"
    code: string
    message: string
    data?: {
        user: {
            uid: string
            id: number
            username: string
            email: string
            phone_number: string
            full_name: string
            first_name: string
            middle_name?: string | null
            last_name: string
            bio?: string | null
            updated_at: Date
        }
        address?: {
            id: number
            user_uid: string
            address: string | null
            street: string | null
            barangay: string | null
            zip_code: string | null
            country: string
            region: string | null
            province: string | null
            city: {
                id: string
                name: string
            } | null
            address_type: "personal"
            is_primary: boolean
            updated_at: Date
        }
        business?: {
            id: number
            user_uid: string
            business_name: string
            business_type: string | null
            business_registration_number: string | null
            business_address: string | null
            updated_at: Date
        }
    }
    details?: {
        missingFields?: string[]
        requiredFields?: string[]
    }
}

/** @deprecated Use UserPersonalInfoFormData instead */
export interface PersonalInfoFormData extends UserPersonalInfoFormData { }
