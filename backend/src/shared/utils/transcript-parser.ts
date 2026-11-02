import { PDFParse } from 'pdf-parse'
import { formatCPF } from './cpf-validator.js'

export interface ParsedApprovedSubject {
  name: string
  period: string
  concept: 'A' | 'B' | 'C' | 'D'
  numericGrade: number
}

export interface ParsedTranscript {
  studentName?: string
  studentCpf?: string
  matricula?: string
  approvedSubjects: ParsedApprovedSubject[]
}

const CONCEPT_TO_NUMERIC: Record<string, number> = {
  A: 10.0,
  B: 8.5,
  C: 7.0,
  D: 5.5,
}

export async function parseUfabcTranscript(pdfBuffer: Buffer): Promise<ParsedTranscript> {
  const parser = new PDFParse({ data: pdfBuffer })
  const result = await parser.getText()
  const fullText = result.pages.map((p: { text: string }) => p.text).join('\n')

  // Extrair Nome, CPF e Matrícula
  const cpfMatch = fullText.match(/N[ºo]\s*do\s*CPF:\s*([\d\.-]+)/i)
  const nameMatch = fullText.match(/Nome:\s*([^\n\t]+)/i)
  const matriculaMatch = fullText.match(/Matr[íi]cula:\s*(\d+)/i)

  const studentCpf = cpfMatch ? formatCPF(cpfMatch[1]) : undefined
  const studentName = nameMatch ? nameMatch[1].trim() : undefined
  const matricula = matriculaMatch ? matriculaMatch[1].trim() : undefined

  const lines = fullText.split('\n')
  const approvedMap = new Map<string, ParsedApprovedSubject>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const yearMatch = line.match(/^(\d{4}\.\d)\s+(.+)$/)

    if (yearMatch) {
      const period = yearMatch[1]
      const nameParts = [yearMatch[2].trim()]

      let j = i + 1
      let status = ''
      let concept: 'A' | 'B' | 'C' | 'D' | null = null

      while (j < Math.min(lines.length, i + 12)) {
        const nextLine = lines[j].trim()

        if (/^\d{4}\.\d/.test(nextLine) || nextLine.includes('Legenda') || nextLine.includes('Histórico Escolar')) {
          break
        }

        if (['APR', 'APRN', 'REP', 'REPF', 'REPMF', 'REPN', 'REPNF', 'MATR', 'DISP', 'CUMP'].includes(nextLine)) {
          status = nextLine
        } else if (
          !status &&
          !/^(DA|DB|DC|NA|NB|NC)\d|^[A-Z0-9]{5,}-|^\d+/.test(nextLine) &&
          !nextLine.startsWith('PROF') &&
          !nextLine.startsWith('PROFA')
        ) {
          nameParts.push(nextLine)
        }

        const gradeMatch =
          nextLine.match(/\b([ABCD])\b\t?(?:OBR|OL|LIV|\d)/) ||
          nextLine.match(/\b([ABCD])\s+(?:OBR|OL|LIV|\d)/)

        if (gradeMatch && !concept) {
          concept = gradeMatch[1] as 'A' | 'B' | 'C' | 'D'
        }

        if (status && concept) break
        j++
      }

      const fullName = nameParts
        .join(' ')
        .replace(/\s+/g, ' ')
        .toUpperCase()
        .trim()

      if ((status === 'APR' || status === 'APRN') && concept && fullName !== 'DISPENSADO') {
        const numericGrade = CONCEPT_TO_NUMERIC[concept] || 7.0

        // Se já existe e a nova nota/conceito for maior, atualiza
        const existing = approvedMap.get(fullName)
        if (!existing || numericGrade > existing.numericGrade) {
          approvedMap.set(fullName, {
            name: fullName,
            period,
            concept,
            numericGrade,
          })
        }
      }
    }
  }

  return {
    studentName,
    studentCpf,
    matricula,
    approvedSubjects: Array.from(approvedMap.values()),
  }
}
