import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const initialSubjects = [
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

async function main() {
  console.log('🌱 Populando catálogo de matérias universitárias...')

  for (const subject of initialSubjects) {
    await prisma.subject.upsert({
      where: { code: subject.code },
      update: {
        name: subject.name,
        aliases: subject.aliases,
        department: subject.department,
      },
      create: subject,
    })
  }

  console.log('✅ Catálogo populado com sucesso!')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed de matérias:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
