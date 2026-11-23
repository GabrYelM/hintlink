import { RequestsRepository } from './requests.repository.js'
import { AcademicRecordsRepository } from '../academic-records/academic-records.repository.js'
import { UsersRepository } from '../users/users.repository.js'
import { doesTutorFulfillStudentSchedule, ScheduleSlot } from './matchmaking.service.js'

interface FetchOpenRequestsInput {
  tutorId?: string
  onlyEligibleSubjects?: boolean
}

export class FetchOpenRequestsService {
  constructor(
    private requestsRepository: RequestsRepository,
    private academicRecordsRepository: AcademicRecordsRepository,
    private usersRepository: UsersRepository = new UsersRepository()
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

    const allOpenRequests = await this.requestsRepository.findManyOpen(eligibleSubjectIds)

    if (!tutorId) {
      return { requests: allOpenRequests }
    }

    const user = await this.usersRepository.findById(tutorId).catch(() => null)

    // Se o usuário logado é um MONITOR (TUTOR), apresentamos apenas as aulas cujo horário o monitor consegue cumprir!
    // (Se for o próprio aluno consultando seus chamados, sempre retorna os chamados dele).
    const filteredRequests = allOpenRequests.filter((req) => {
      if (req.studentId === tutorId) {
        return true
      }

      // Se for uma solicitação de aula direta pelo chat (DIRECT:<tutorId>), exibe apenas para o monitor destinatário
      if (typeof req.matchQueue === 'string' && req.matchQueue.startsWith('DIRECT:')) {
        return req.matchQueue === `DIRECT:${tutorId}`
      }

      if (user && user.role === 'TUTOR') {
        const studentSlots = Array.isArray(req.studentAvailability)
          ? (req.studentAvailability as unknown as ScheduleSlot[])
          : []

        if (studentSlots.length > 0) {
          const tutorSlots = Array.isArray(user.availability)
            ? (user.availability as unknown as ScheduleSlot[])
            : []
          return doesTutorFulfillStudentSchedule(studentSlots, tutorSlots, req.durationMinutes)
        }
      }

      return true
    })

    return {
      requests: filteredRequests,
    }
  }
}
