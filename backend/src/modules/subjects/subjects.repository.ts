import { Subject } from '@prisma/client'
import { prisma } from '../../shared/database/prisma.js'

export const DEFAULT_SUBJECTS = [
  {
    code: 'MAT101',
    name: 'Cálculo Diferencial e Integral I',
    aliases: ['Cálculo 1', 'Cálculo I', 'Bases Matemáticas', 'CDI 1', 'Cálculo A'],
    department: 'Matemática e Estatística',
  },
  {
    code: 'MAT102',
    name: 'Geometria Analítica e Álgebra Linear',
    aliases: ['GAAL', 'Álgebra Linear', 'Geometria Analítica', 'Vetores e Geometria'],
    department: 'Matemática e Estatística',
  },
  {
    code: 'FIS101',
    name: 'Física Geral e Experimental I',
    aliases: ['Física 1', 'Física I', 'Mecânica Clássica', 'Física Geral 1'],
    department: 'Física',
  },
  {
    code: 'CC101',
    name: 'Algoritmos e Estruturas de Dados I',
    aliases: ['AEDS 1', 'AED 1', 'Introdução à Programação', 'Algoritmos', 'Lógica de Programação'],
    department: 'Ciência da Computação',
  },
  {
    code: 'CC102',
    name: 'Programação Orientada a Objetos',
    aliases: ['POO', 'OOP', 'Paradigmas de Programação', 'Java', 'C#'],
    department: 'Ciência da Computação',
  },
  {
    code: 'CC201',
    name: 'Banco de Dados I',
    aliases: ['BD 1', 'Sistemas de Banco de Dados', 'Modelagem de Dados', 'SQL'],
    department: 'Ciência da Computação',
  },
  {
    code: 'EST101',
    name: 'Probabilidade e Estatística',
    aliases: ['Estatística Aplicada', 'Bioestatística', 'Introdução à Estatística'],
    department: 'Matemática e Estatística',
  },
  {
    code: 'QUI101',
    name: 'Química Geral',
    aliases: ['Química Fundamental', 'Fundamentos de Química', 'Química 1'],
    department: 'Química',
  },
]

export class SubjectsRepository {
  private async ensureSeed() {
    try {
      const count = await prisma.subject.count()
      if (count === 0) {
        await prisma.subject.createMany({
          data: DEFAULT_SUBJECTS,
          skipDuplicates: true,
        })
      }
    } catch (err) {
      console.error('Falha ao auto-popular matérias:', err)
    }
  }

  async findAll(query?: string): Promise<Subject[]> {
    await this.ensureSeed()

    if (!query) {
      return prisma.subject.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      })
    }

    const cleanQuery = query.trim()

    return prisma.subject.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: cleanQuery, mode: 'insensitive' } },
          { code: { contains: cleanQuery, mode: 'insensitive' } },
          { aliases: { hasSome: [cleanQuery] } },
        ],
      },
      orderBy: { name: 'asc' },
    })
  }

  async findById(id: string): Promise<Subject | null> {
    return prisma.subject.findUnique({
      where: { id },
    })
  }

  async findByCode(code: string): Promise<Subject | null> {
    return prisma.subject.findUnique({
      where: { code },
    })
  }
}
