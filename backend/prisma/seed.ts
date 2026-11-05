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

  const createdSubjects = []
  for (const subject of initialSubjects) {
    const s = await prisma.subject.upsert({
      where: { code: subject.code },
      update: {
        name: subject.name,
        aliases: subject.aliases,
        department: subject.department,
      },
      create: subject,
    })
    createdSubjects.push(s)
  }

  console.log('✅ Catálogo populado com sucesso!')

  console.log('👤 Populando usuários de demonstração...')

  // Senha padrão "123456" para contas de teste
  const passwordHash = '$2a$08$uh9fRKO1mN3fs/pygxpPZO7fyhSb/SmO7TEl.M36O1YVyr.KkgcDO'

  // 1. Aluno de Demonstração
  const demoStudent = await prisma.user.upsert({
    where: { email: 'aluno@aluno.ufabc.edu.br' },
    update: {},
    create: {
      name: 'Aluno Demonstração',
      username: 'aluno',
      email: 'aluno@aluno.ufabc.edu.br',
      cpf: '11144477735',
      passwordHash,
      role: 'STUDENT',
    },
  })

  // 2. Monitor de Demonstração
  const demoTutor = await prisma.user.upsert({
    where: { email: 'monitor@aluno.ufabc.edu.br' },
    update: {},
    create: {
      name: 'Lucas Mendes (Monitor)',
      username: 'monitor',
      email: 'monitor@aluno.ufabc.edu.br',
      cpf: '22255588846',
      passwordHash,
      role: 'TUTOR',
      rating: 4.9,
      totalReviews: 8,
    },
  })

  // 3. Usuário Gabryel (Monitor)
  const gabryelUser = await prisma.user.upsert({
    where: { email: 'gabryel.m@aluno.ufabc.edu.br' },
    update: {},
    create: {
      name: 'Gabryel Gomes Martins',
      username: 'thefirst',
      email: 'gabryel.m@aluno.ufabc.edu.br',
      cpf: '49063244878',
      passwordHash,
      role: 'TUTOR',
      rating: 5.0,
      totalReviews: 3,
    },
  })

  // 4. Usuário Rafa (Aluno)
  await prisma.user.upsert({
    where: { email: 'rafa@aluno.ufabc.edu.br' },
    update: {},
    create: {
      name: 'Rafaela Santos',
      username: 'rafa',
      email: 'rafa@aluno.ufabc.edu.br',
      cpf: '49063199805',
      passwordHash,
      role: 'STUDENT',
    },
  })

  // Vincula matérias aprovadas para os monitores
  const tutorIds = [demoTutor.id, gabryelUser.id]
  for (const tutorId of tutorIds) {
    for (const subject of createdSubjects.slice(0, 4)) {
      await prisma.academicRecord.upsert({
        where: {
          userId_subjectId: {
            userId: tutorId,
            subjectId: subject.id,
          },
        },
        update: {},
        create: {
          userId: tutorId,
          subjectId: subject.id,
          concept: 'A',
          grade: 9.5,
          isApproved: true,
          validatedAt: new Date(),
        },
      })
    }
  }

  console.log('✅ Usuários e registros de monitoria populados!')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed de matérias:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
