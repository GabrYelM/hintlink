import { AcademicRecordsRepository } from './academic-records.repository.js'
import { SubjectsRepository } from '../subjects/subjects.repository.js'
import { UsersRepository } from '../users/users.repository.js'
import { AppError } from '../../shared/errors/app-error.js'

interface AddTutorSubjectRequest {
  userId: string
  subjectId: string
  grade?: number
  proofDocumentUrl?: string
}

export class AddTutorSubjectService {
  constructor(
    private academicRecordsRepository: AcademicRecordsRepository,
    private subjectsRepository: SubjectsRepository,
    private usersRepository: UsersRepository
  ) {}

  async execute({ userId, subjectId, grade, proofDocumentUrl }: AddTutorSubjectRequest) {
    const user = await this.usersRepository.findById(userId)
    if (!user) {
      throw new AppError('Usuário não encontrado.', 404)
    }

    if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
      throw new AppError('Apenas monitores podem cadastrar matérias aptas do histórico.', 403)
    }

    const subject = await this.subjectsRepository.findById(subjectId)
    if (!subject) {
      throw new AppError('Matéria não encontrada no catálogo.', 404)
    }

    const existingRecord = await this.academicRecordsRepository.findByUserAndSubject(userId, subjectId)
    if (existingRecord) {
      throw new AppError('Esta matéria já está vinculada ao seu histórico.', 409)
    }

    // Por padrão acadêmico, o monitor envia o comprovante para validação
    const academicRecord = await this.academicRecordsRepository.create({
      userId,
      subjectId,
      grade,
      proofDocumentUrl,
      isApproved: true, // Auto-aprovado no MVP de desenvolvimento
    })

    return {
      academicRecord,
    }
  }
}
