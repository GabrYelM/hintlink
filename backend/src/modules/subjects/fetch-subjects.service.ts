import { Subject } from '@prisma/client'
import { SubjectsRepository } from './subjects.repository.js'

interface FetchSubjectsRequest {
  query?: string
}

interface FetchSubjectsResponse {
  subjects: Subject[]
}

export class FetchSubjectsService {
  constructor(private subjectsRepository: SubjectsRepository) {}

  async execute({ query }: FetchSubjectsRequest): Promise<FetchSubjectsResponse> {
    const subjects = await this.subjectsRepository.findAll(query)

    return {
      subjects,
    }
  }
}
