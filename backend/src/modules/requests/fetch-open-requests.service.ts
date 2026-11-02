import { RequestsRepository } from './requests.repository.js'
import { AcademicRecordsRepository } from '../academic-records/academic-records.repository.js'

interface FetchOpenRequestsInput {
  tutorId?: string
  onlyEligibleSubjects?: boolean
}

export class FetchOpenRequestsService {
  constructor(
    private requestsRepository: RequestsRepository,
    private academicRecordsRepository: AcademicRecordsRepository
  ) {}

  async execute({ tutorId, onlyEligibleSubjects }: FetchOpenRequestsInput) {
    let eligibleSubjectIds: string[] | undefined

    if (tutorId && onlyEligibleSubjects) {
      const records = await this.academicRecordsRepository.findManyByUserId(tutorId)
      // Filtra apenas matérias aprovadas no histórico
      eligibleSubjectIds = records
        .filter((r) => r.isApproved)
        .map((r) => r.subjectId)
    }

    const requests = await this.requestsRepository.findManyOpen(eligibleSubjectIds)

    return {
      requests,
    }
  }
}
