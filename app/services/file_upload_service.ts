import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { MultipartFile } from '@adonisjs/core/bodyparser'
import { DateTime } from 'luxon'
import { v4 as uuidv4 } from 'uuid'
import fs from 'node:fs/promises'

export default class FileUploadService {
  private s3Client: S3Client
  private bucketName: string

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
    this.bucketName = process.env.AWS_S3_BUCKET || 'tax-registration-documents'
  }

  /**
   * Upload un fichier de demande d'immatriculation vers S3
   *
   * @param file - Fichier multipart à uploader
   * @param requestId - ID de la demande d'immatriculation (optionnel)
   * @returns Promise<{ success: boolean; url?: string; message: string; metadata?: object }>
   */
  async uploadTaxRegistrationDocument(
    file: MultipartFile,
    requestId?: number
  ): Promise<{
    success: boolean
    url?: string
    message: string
    metadata?: {
      originalName: string
      size: number
      mimeType: string
      uploadedAt: string
      s3Key: string
    }
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

      // Génération du nom de fichier unique
      const fileExtension = this.getFileExtension(file.clientName)
      const timestamp = DateTime.now().toFormat('yyyy-MM-dd-HHmmss')
      const uniqueId = uuidv4().substring(0, 8)
      const requestPrefix = requestId ? `request-${requestId}` : 'temp'

      const s3Key = `tax-registrations/${requestPrefix}/${timestamp}-${uniqueId}${fileExtension}`

      // Lecture du contenu du fichier avec AdonisJS
      const fileBuffer = await fs.readFile(file.tmpPath!)

      // Configuration de l'upload S3
      const uploadParams = {
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: file.headers['content-type'] || 'application/octet-stream',
        ContentDisposition: `attachment; filename="${file.clientName}"`,
        Metadata: {
          originalName: file.clientName || 'unknown',
          uploadedBy: 'tax-registration-system',
          uploadedAt: DateTime.now().toISO(),
          requestId: requestId?.toString() || 'temp',
        },
      }

      // Upload vers S3
      const command = new PutObjectCommand(uploadParams)
      await this.s3Client.send(command)

      // Génération de l'URL publique (ou signée selon votre configuration)
      const fileUrl = this.generateFileUrl(s3Key)

      return {
        success: true,
        url: fileUrl,
        message: 'File uploaded successfully',
        metadata: {
          originalName: file.clientName || 'unknown',
          size: file.size,
          mimeType: file.headers['content-type'] || 'application/octet-stream',
          uploadedAt: DateTime.now().toISO(),
          s3Key: s3Key,
        },
      }
    } catch (error) {
      console.error('Error uploading file to S3:', error)
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
    // Vérification de la taille (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB en bytes
    if (file.size > maxSize) {
      return {
        isValid: false,
        message: 'File size must be less than 10MB',
      }
    }

    // Types de fichiers autorisés pour les documents d'immatriculation
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

    return {
      isValid: true,
      message: 'File is valid',
    }
  }

  /**
   * Extrait l'extension du fichier
   */
  private getFileExtension(filename?: string): string {
    if (!filename) return ''
    const lastDot = filename.lastIndexOf('.')
    return lastDot !== -1 ? filename.substring(lastDot) : ''
  }

  /**
   * Génère l'URL du fichier
   * Peut être une URL publique ou signée selon votre configuration S3
   */
  private generateFileUrl(s3Key: string): string {
    // Option 1: URL publique (si votre bucket est configuré pour l'accès public)
    // return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`

    // Option 2: URL signée temporaire (plus sécurisé)
    return `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`
  }

  /**
   * Génère une URL signée temporaire pour l'accès sécurisé au fichier
   *
   * @param s3Key - Clé S3 du fichier
   * @param expiresIn - Durée d'expiration en secondes (défaut: 1 heure)
   * @returns Promise<string> - URL signée
   */
  async generateSignedUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      })

      return await getSignedUrl(this.s3Client, command, { expiresIn })
    } catch (error) {
      console.error('Error generating signed URL:', error)
      throw new Error('Failed to generate signed URL')
    }
  }

  /**
   * Supprime un fichier de S3
   *
   * @param s3Key - Clé S3 du fichier à supprimer
   * @returns Promise<boolean> - Succès de la suppression
   */
  async deleteFile(s3Key: string): Promise<boolean> {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      })

      await this.s3Client.send(command)
      return true
    } catch (error) {
      console.error('Error deleting file from S3:', error)
      return false
    }
  }
}
