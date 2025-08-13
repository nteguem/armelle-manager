export interface PersonalInfo {
  fullName: string
  gender: 'M' | 'F'
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed'
  birthDate: string
  nationality: string
}

export interface AddressInfo {
  zoneType: 'urban' | 'rural'
  city?: string
  region?: string
  neighborhood?: string
  village?: string
  commune?: string
  gpsCoordinates?: {
    latitude: number
    longitude: number
  }
}

export interface ContactInfo {
  phoneNumber: string
  email?: string
}

export interface ProfessionalInfo {
  profession: string
  activitySector: string
}

export interface LegalEntityInfo {
  companyName: string
  acronym: string
  creationDate: string
  creationPlace: string
  legalForm: string
  rccm: string
  managerNationality: string
  managerName: string
  managerNiu?: string
  projectedTurnover: number
  employeeCount: number
  shareCapital: number
  hasShareholders: boolean
  hasBoardOfDirectors: boolean
  headquarters: {
    address: AddressInfo
    leaseStatus: 'owner' | 'tenant' | 'occupant'
  }
  mainEstablishment: {
    sameAsHeadquarters: boolean
    address?: AddressInfo
    mainActivity: string
    productionCapacity: string
    leaseStatus: 'owner' | 'tenant' | 'occupant'
  }
  taxRegime: string
}

// Structure unifiée pour tous les types
export interface RegistrationData {
  personalInfo: PersonalInfo
  addressInfo: AddressInfo
  contactInfo: ContactInfo
  professionalInfo?: ProfessionalInfo // Pour individual_professional
  legalEntityInfo?: LegalEntityInfo // Pour legal_entity
}

export const CONTRIBUTOR_TYPES = [
  'individual_non_professional',
  'individual_professional',
  'legal_entity',
] as const

export const REGISTRATION_STATUSES = ['pending', 'processed', 'rejected'] as const

export const SOURCES = ['whatsapp_bot', 'admin_dashboard'] as const
