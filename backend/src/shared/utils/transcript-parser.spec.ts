import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseUfabcTranscript } from './transcript-parser.js'

describe('UFABC Transcript Parser', () => {
  it('should parse official UFABC transcript PDF, extract student data and approved subjects', async () => {
    const pdfPath = path.resolve(__dirname, '../../../../historico_11202131499.pdf')

    if (!fs.existsSync(pdfPath)) {
      console.warn('Transcript PDF not found for test, skipping local file test.')
      return
    }

    const buffer = fs.readFileSync(pdfPath)
    const result = await parseUfabcTranscript(buffer)

    expect(result.studentName).toContain('GABRYEL GOMES MARTINS')
    expect(result.studentCpf).toBe('49063244878')
    expect(result.matricula).toBe('11202131499')
    expect(result.approvedSubjects.length).toBeGreaterThan(15)

    // Verifica matérias específicas aprovadas do histórico
    const basesMatematicas = result.approvedSubjects.find(s => s.name.includes('BASES MATEMÁTICAS'))
    expect(basesMatematicas).toBeDefined()
    expect(basesMatematicas?.concept).toBe('B')
    expect(basesMatematicas?.numericGrade).toBe(8.5)

    const algebraLinear = result.approvedSubjects.find(s => s.name.includes('ÁLGEBRA LINEAR'))
    expect(algebraLinear).toBeDefined()
    expect(algebraLinear?.concept).toBe('C')

    const procInfo = result.approvedSubjects.find(s => s.name.includes('PROCESSAMENTO DA INFORMAÇÃO'))
    expect(procInfo).toBeDefined()
    expect(procInfo?.concept).toBe('A')
  })
})
