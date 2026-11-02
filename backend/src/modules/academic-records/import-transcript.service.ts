import { prisma } from '../../shared/database/prisma.js'
import { AppError } from '../../shared/errors/app-error.js'
import { parseUfabcTranscript } from '../../shared/utils/transcript-parser.js'

interface ImportTranscriptInput {
  userId: string
  pdfBuffer: Buffer
}

export class ImportTranscriptService {
  async execute({ userId, pdfBuffer }: ImportTranscriptInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new AppError('Usuário não encontrado.', 404)
    }

    const parsed = await parseUfabcTranscript(pdfBuffer)

    if (parsed.approvedSubjects.length === 0) {
      throw new AppError(
        'Nenhuma matéria aprovada foi identificada no PDF. Certifique-se de enviar um Histórico Escolar válido da UFABC.',
        400
      )
    }

    // Trava de Segurança e Integridade: Verifica se o CPF do PDF é o mesmo do usuário cadastrado
    if (parsed.studentCpf && user.cpf) {
      const cleanUserCpf = user.cpf.replace(/\D/g, '')
      const cleanPdfCpf = parsed.studentCpf.replace(/\D/g, '')

      if (cleanUserCpf !== cleanPdfCpf) {
        throw new AppError(
          `Inconsistência de autenticidade acadêmica: o CPF no histórico (${parsed.studentCpf}) não coincide com o CPF da sua conta (${user.cpf}).`,
          403
        )
      }
    }

    const importedSubjects = []

    for (const item of parsed.approvedSubjects) {
      // Localiza a matéria no catálogo ou cria caso seja nova
      let dbSubject = await prisma.subject.findFirst({
        where: {
          OR: [
            { name: { equals: item.name, mode: 'insensitive' } },
            { aliases: { has: item.name } },
          ],
        },
      })

      if (!dbSubject) {
        const generatedCode = `UFABC-${item.name
          .replace(/[^A-Z0-9]/gi, '')
          .substring(0, 6)
          .toUpperCase()}`

        // Garante código único
        let uniqueCode = generatedCode
        const existingCode = await prisma.subject.findUnique({ where: { code: generatedCode } })
        if (existingCode) {
          uniqueCode = `${generatedCode}-${Math.floor(100 + Math.random() * 900)}`
        }

        dbSubject = await prisma.subject.create({
          data: {
            code: uniqueCode,
            name: item.name,
            aliases: [item.name],
            department: 'UFABC - Graduação',
          },
        })
      }

      // Upsert no registro acadêmico do monitor
      const record = await prisma.academicRecord.upsert({
        where: {
          userId_subjectId: {
            userId: user.id,
            subjectId: dbSubject.id,
          },
        },
        update: {
          grade: item.numericGrade,
          concept: item.concept,
          isApproved: true,
          validatedAt: new Date(),
        },
        create: {
          userId: user.id,
          subjectId: dbSubject.id,
          grade: item.numericGrade,
          concept: item.concept,
          isApproved: true,
          validatedAt: new Date(),
        },
        include: {
          subject: true,
        },
      })

      importedSubjects.push(record)
    }

    return {
      studentName: parsed.studentName,
      matricula: parsed.matricula,
      cpf: parsed.studentCpf,
      totalApproved: importedSubjects.length,
      records: importedSubjects,
    }
  }
}
