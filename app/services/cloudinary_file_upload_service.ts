import { v2 as cloudinary } from 'cloudinary'
import { MultipartFile } from '@adonisjs/core/bodyparser'
import { DateTime } from 'luxon'
import { v4 as uuidv4 } from 'uuid'

export default class CloudinaryUploadService {
  constructor() {
    // Configuration Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })
  }

  /**
   * Upload un fichier vers Cloudinary
   *
   * @param file - Fichier multipart à uploader
   * @param requestId - ID de la demande d'immatriculation (optionnel)
   */
  async uploadTaxRegistrationDocument(file: MultipartFile): Promise<{
    success: boolean
    url?: string
    message: string
  }> {
    try {
      // Validation du fichier
      const validationResult = this.validateFile(file)
      if (!validationResult.isValid) {
        return {
          success: false,
          message: validationResult.message,
        }
      }

      // Génération du public_id unique
      const timestamp = DateTime.now().toFormat('yyyy-MM-dd-HHmmss')
      const uniqueId = uuidv4().substring(0, 8)
      const publicId = `tax-registrations/${timestamp}-${uniqueId}`

      // Upload vers Cloudinary
      const uploadResult = await cloudinary.uploader.upload(file.tmpPath!, {
        public_id: publicId,
        resource_type: 'auto',
        folder: 'tax-registrations',
      })

      return {
        success: true,
        url: uploadResult.secure_url,
        message: 'File uploaded',
      }
    } catch (error) {
      console.error('Error uploading file to Cloudinary:', error)
      return {
        success: false,
        message: 'Failed to upload file. Please try again.',
      }
    }
  }

  /**
   * Valide le fichier avant upload
   */
  private validateFile(file: MultipartFile): { isValid: boolean; message: string } {
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return {
        isValid: false,
        message: 'File size must be less than 10MB',
      }
    }

    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]

    const fileMimeType = file.headers['content-type']
    if (!fileMimeType || !allowedMimeTypes.includes(fileMimeType)) {
      return {
        isValid: false,
        message: 'File type not allowed. Accepted formats: PDF, JPEG, PNG, DOC, DOCX',
      }
    }

    return { isValid: true, message: 'File is valid' }
  }

  /**
   * Supprime un fichier de Cloudinary
   */
  async deleteFile(publicId: string): Promise<boolean> {
    try {
      await cloudinary.uploader.destroy(publicId)
      return true
    } catch (error) {
      console.error('Error deleting file from Cloudinary:', error)
      return false
    }
  }
}
