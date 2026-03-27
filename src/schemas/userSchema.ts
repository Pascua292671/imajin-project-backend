// NORMALIZED USER SCHEMA - FOCUSED ON USER MANAGEMENT
// File: schema/users.ts
import {
    boolean,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
    pgEnum,
    jsonb,
    index,
    uniqueIndex,
    integer,
    date,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';

// =============================================================================
// ENUMS
// =============================================================================
export const user_status_enum = pgEnum('user_status', [
    'active',
    'inactive',
    'suspended',
    'pending_verification', // For lender verification
    'verified',           // For verified lenders
    'rejected'            // For rejected lender applications
]);

export const id_type_enum = pgEnum('id_type', [
    'NATIONAL_ID',
    'DRIVERS_LICENSE',
    'PASSPORT',
    'SSS_ID',
    'PHILHEALTH_ID',
    'VOTERS_ID',
    'TIN_ID',
    'POSTAL_ID',
    'UMID',
    'PRC_ID'
]);

export const business_type_enum = pgEnum('business_type', [
    'INDIVIDUAL',
    'STORE'
]);

export const document_type_enum = pgEnum('document_type', [
    'VALID_ID',
    'SELFIE_WITH_ID',
    'SECONDARY_ID_1',
    'SECONDARY_ID_2',
    'BUSINESS_PERMIT',
    'DTI_CERTIFICATE',
    'STOREFRONT_PHOTO'
]);

// =============================================================================
// CORE USERS TABLE (Clean and minimal)
// =============================================================================
export const users = pgTable('users', {
    // Using Supabase auth user ID as primary key
    uid: uuid('uid').primaryKey(),
    id: uuid('id').default(sql`gen_random_uuid()`).notNull().unique(),

    // Required fields for initial signup
    username: varchar('username', { length: 100 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    phone_number: varchar('phone_number', { length: 20 }).notNull(),
    password: text('password').notNull(),
    address: text('address').notNull(), // Full address string (can be parsed into components if needed)


    // Personal information fields (optional)
    full_name: varchar('full_name', { length: 255 }),
    first_name: varchar('first_name', { length: 100 }),
    middle_name: varchar('middle_name', { length: 100 }),
    last_name: varchar('last_name', { length: 100 }),
    birth_date: date('birth_date', { mode: 'date' }),


    // Profile fields (optional)

    bio: text('bio'),
    profile_image: text('profile_image'),
    profile_background: text('profile_background'),

    // Role and status (defaults set)
    role: text('role').array().notNull().default(['Customer']),
    current_role: text('current_role').default('Customer'), // Track which role is currently active
    status: user_status_enum('status').default('active').notNull(),
    is_online: boolean('is_online').default(false),

    // Rejection/suspension messages (optional)
    rejected_message: text('rejected_message'),
    suspended_message: text('suspended_message'),

    // Auth and tracking (defaults set)
    email_verified: boolean('email_verified').default(false),
    phone_verified: boolean('phone_verified').default(false),
    last_seen: timestamp('last_seen', { withTimezone: true }),
    last_account_status_email_sent: integer('last_account_status_email_sent'),

    // Password reset (optional)
    reset_token: varchar('reset_token', { length: 255 }),
    reset_token_expiry: timestamp('reset_token_expiry', { withTimezone: true }),

    // Premium subscription fields
    is_premium: boolean('is_premium').default(false).notNull(),
    subscription_type: varchar('subscription_type', { length: 50 }), // 'monthly' or 'yearly'
    subscription_status: varchar('subscription_status', { length: 50 }).default('inactive'), // 'active', 'inactive', 'expired', 'cancelled'
    subscription_start_date: timestamp('subscription_start_date', { withTimezone: true }),
    subscription_end_date: timestamp('subscription_end_date', { withTimezone: true }),
    subscription_payment_id: varchar('subscription_payment_id', { length: 255 }), // PayMongo payment intent ID
    subscription_reference: varchar('subscription_reference', { length: 255 }), // Reference code for tracking
    subscription_session_id: varchar('subscription_session_id', { length: 255 }), // PayMongo checkout session ID

    // Timestamps (auto-set)    
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (users) => [
    uniqueIndex('users_email_idx').on(users.email),
    uniqueIndex('users_username_idx').on(users.username),
    index('users_status_idx').on(users.status),
    index('users_role_idx').on(users.role),
    index('users_reset_token_idx').on(users.reset_token),
]);

// =============================================================================
// USER ADDRESSES TABLE
// =============================================================================
export const user_addresses = pgTable('user_addresses', {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    user_uid: uuid('user_uid').references(() => users.uid, { onDelete: 'cascade' }).notNull(),

    // Address fields from your original schema
    address: text('address'), // Full address string
    street: varchar('street', { length: 255 }),
    barangay: varchar('barangay', { length: 255 }),
    zip_code: varchar('zip_code', { length: 20 }),
    country: varchar('country', { length: 100 }).default('Philippines'),
    region: varchar('region', { length: 100 }),
    province: varchar('province', { length: 100 }),
    city: jsonb('city').$type<{
        id: string;
        name: string;
    }>(),

    // Address type and status
    address_type: varchar('address_type', { length: 50 }).default('personal'), // 'personal' or 'business'
    is_primary: boolean('is_primary').default(true),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (user_addresses) => [
    index('user_addresses_user_idx').on(user_addresses.user_uid),
    index('user_addresses_type_idx').on(user_addresses.address_type),
    index('user_addresses_primary_idx').on(user_addresses.is_primary),
]);

// =============================================================================
// USER DOCUMENTS TABLE (All ID and verification documents)
// =============================================================================
export const user_documents = pgTable('user_documents', {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    user_uid: uuid('user_uid').references(() => users.uid, { onDelete: 'cascade' }).notNull(),

    // Document info
    document_type: document_type_enum('document_type').notNull(),

    // ID-specific fields (for ID documents only)
    id_type: id_type_enum('id_type'), // Only populated for VALID_ID, SECONDARY_ID_1, SECONDARY_ID_2
    id_number: varchar('id_number', { length: 100 }), // Only for ID documents

    // File info
    file_url: text('file_url').notNull(),
    file_name: varchar('file_name', { length: 255 }),

    // Document verification status
    has_valid_id: boolean('has_valid_id').default(false).notNull(),
    is_verified: boolean('is_verified').default(false),
    verified_at: timestamp('verified_at', { withTimezone: true }),
    verified_by: uuid('verified_by'), // Admin who verified
    rejection_reason: text('rejection_reason'),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (user_documents) => [
    index('user_documents_user_idx').on(user_documents.user_uid),
    index('user_documents_type_idx').on(user_documents.document_type),
    index('user_documents_verified_idx').on(user_documents.is_verified),
    uniqueIndex('user_documents_unique_type_idx').on(user_documents.user_uid, user_documents.document_type),
]);

// =============================================================================
// USER BUSINESS INFO TABLE (For lenders only)
// =============================================================================
export const user_business_info = pgTable('user_business_info', {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    user_uid: uuid('user_uid').references(() => users.uid, { onDelete: 'cascade' }).notNull().unique(),

    // Basic business info from your original business_info JSONB
    business_name: varchar('business_name', { length: 255 }),
    business_description: text('business_description'),
    business_type: business_type_enum('business_type'),
    business_email: varchar('business_email', { length: 255 }),
    business_phone_number: varchar('business_phone_number', { length: 20 }),
    business_telephone: varchar('business_telephone', { length: 20 }),

    // Business media
    business_profile_image: text('business_profile_image'),
    business_background_image: text('business_background_image'),

    // Business documents (file URLs)
    upload_business_permit: text('upload_business_permit'),
    business_permit_file: text('business_permit_file'),
    upload_dti_certificate: text('upload_dti_certificate'),
    upload_storefront_photo: text('upload_storefront_photo'),

    // Terms and conditions
    terms_and_conditions: text('terms_and_conditions'),

    // Verification status
    is_verified: boolean('is_verified').default(false),
    verified_at: timestamp('verified_at', { withTimezone: true }),
    verified_by: uuid('verified_by'), // Admin who verified
    rejection_reason: text('rejection_reason'),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (user_business_info) => [
    index('user_business_info_user_idx').on(user_business_info.user_uid),
    index('user_business_info_verified_idx').on(user_business_info.is_verified),
    index('user_business_info_type_idx').on(user_business_info.business_type),
]);

// =============================================================================
// BUSINESS ADDRESSES TABLE (Separate from personal addresses)
// =============================================================================
export const business_addresses = pgTable('business_addresses', {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    business_info_id: uuid('business_info_id').references(() => user_business_info.id, { onDelete: 'cascade' }).notNull(),

    // Business address fields (from your original business_info JSONB)
    business_address: text('business_address'), // Full business address string
    street: varchar('street', { length: 255 }),
    barangay: varchar('barangay', { length: 255 }),
    zip_code: varchar('zip_code', { length: 20 }),
    province: varchar('province', { length: 100 }),
    region: varchar('region', { length: 100 }),
    country: varchar('country', { length: 100 }).default('Philippines'),
    city: jsonb('city').$type<{
        id: string;
        name: string;
    }>(),

    is_primary: boolean('is_primary').default(true),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (business_addresses) => [
    index('business_addresses_business_idx').on(business_addresses.business_info_id),
]);

// =============================================================================
// RELATIONS
// =============================================================================
// Export a function to create user relations after all tables are defined
export function createUserRelations(costumesTable: PgTableWithColumns<any>) {
    return relations(users, ({ many, one }) => ({
        addresses: many(user_addresses),
        documents: many(user_documents),
        businessInfo: one(user_business_info),
        costumes: many(costumesTable, { relationName: 'lender' }),
    }));
}

export const userAddressesRelations = relations(user_addresses, ({ one }) => ({
    user: one(users, {
        fields: [user_addresses.user_uid],
        references: [users.uid],
    }),
}));

export const userDocumentsRelations = relations(user_documents, ({ one }) => ({
    user: one(users, {
        fields: [user_documents.user_uid],
        references: [users.uid],
    }),
}));

export const userBusinessInfoRelations = relations(user_business_info, ({ one, many }) => ({
    user: one(users, {
        fields: [user_business_info.user_uid],
        references: [users.uid],
    }),
    addresses: many(business_addresses),
}));

export const businessAddressesRelations = relations(business_addresses, ({ one }) => ({
    businessInfo: one(user_business_info, {
        fields: [business_addresses.business_info_id],
        references: [user_business_info.id],
    }),
}));

// =============================================================================
// TYPE EXPORTS
// =============================================================================
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type UserAddress = InferSelectModel<typeof user_addresses>;
export type NewUserAddress = InferInsertModel<typeof user_addresses>;
export type UserDocument = InferSelectModel<typeof user_documents>;
export type NewUserDocument = InferInsertModel<typeof user_documents>;
export type UserBusinessInfo = InferSelectModel<typeof user_business_info>;
export type NewUserBusinessInfo = InferInsertModel<typeof user_business_info>;
export type BusinessAddress = InferSelectModel<typeof business_addresses>;
export type NewBusinessAddress = InferInsertModel<typeof business_addresses>;

// Enum types
export type UserStatus = typeof user_status_enum.enumValues[number];
export type IdType = typeof id_type_enum.enumValues[number];
export type BusinessType = typeof business_type_enum.enumValues[number];
export type DocumentType = typeof document_type_enum.enumValues[number];