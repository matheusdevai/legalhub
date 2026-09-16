import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiAttachmentsInput } from './aiSharedUi'
import { AI_ATTACHMENT_MAX_COUNT } from './aiAttachment'

function pdfFile(name = 'peticao.pdf', bytes = 1024) {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' })
}

// userEvent.upload() respeita o atributo "accept" do input e nem dispara o
// evento de change pra um tipo fora dele — reflete o seletor nativo do SO,
// mas esconde o comportamento da nossa validação de defesa-em-profundidade
// (o servidor nunca confia só nisso; drag-and-drop também ignora "accept").
// Pra testar essa camada, simula a seleção direto via fireEvent.
function selectFilesBypassingAccept(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  fireEvent.change(input)
}

describe('AiAttachmentsInput', () => {
  it('mostra o input de arquivo quando nenhum anexo foi selecionado', () => {
    render(<AiAttachmentsInput value={[]} onChange={vi.fn()} />)
    expect(screen.getByText(/Anexar PDF ou imagem/)).toBeInTheDocument()
  })

  it('converte o arquivo selecionado e chama onChange com o anexo', async () => {
    const onChange = vi.fn()
    render(<AiAttachmentsInput value={[]} onChange={onChange} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, pdfFile())

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const [attachments] = onChange.mock.calls[0]
    expect(attachments).toHaveLength(1)
    expect(attachments[0].filename).toBe('peticao.pdf')
    expect(attachments[0].mime_type).toBe('application/pdf')
    expect(attachments[0].data_base64.length).toBeGreaterThan(0)
  })

  it('converte múltiplos arquivos selecionados de uma vez e acumula sobre os já anexados', async () => {
    const onChange = vi.fn()
    const existing = [{ mime_type: 'application/pdf', data_base64: 'YWJj', filename: 'ja-anexado.pdf' }]
    render(<AiAttachmentsInput value={existing} onChange={onChange} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, [pdfFile('a.pdf'), pdfFile('b.pdf')])

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const [attachments] = onChange.mock.calls[0]
    expect(attachments).toHaveLength(3)
    expect(attachments.map((a: { filename: string }) => a.filename)).toEqual(['ja-anexado.pdf', 'a.pdf', 'b.pdf'])
  })

  it('rejeita tipo de arquivo não suportado sem chamar onChange', async () => {
    const onChange = vi.fn()
    render(<AiAttachmentsInput value={[]} onChange={onChange} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const docFile = new File(['x'], 'contrato.doc', { type: 'application/msword' })
    selectFilesBypassingAccept(input, [docFile])

    expect(await screen.findByText('Tipo de arquivo não suportado. Anexe um PDF, JPEG ou PNG.')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejeita arquivo acima de 15MB sem chamar onChange', async () => {
    const onChange = vi.fn()
    render(<AiAttachmentsInput value={[]} onChange={onChange} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const bigFile = pdfFile('grande.pdf', 15 * 1024 * 1024 + 1)
    await userEvent.upload(input, bigFile)

    expect(await screen.findByText('Arquivo muito grande (máx. 15MB).')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('mostra o nome dos arquivos anexados e permite remover um deles', async () => {
    const onChange = vi.fn()
    render(<AiAttachmentsInput
      value={[
        { mime_type: 'application/pdf', data_base64: 'YWJj', filename: 'peticao.pdf' },
        { mime_type: 'image/png', data_base64: 'YWJj', filename: 'foto.png' },
      ]}
      onChange={onChange}
    />)

    expect(screen.getByText('peticao.pdf')).toBeInTheDocument()
    expect(screen.getByText('foto.png')).toBeInTheDocument()

    const removeButtons = screen.getAllByRole('button')
    await userEvent.click(removeButtons[0])
    expect(onChange).toHaveBeenCalledWith([{ mime_type: 'image/png', data_base64: 'YWJj', filename: 'foto.png' }])
  })

  it('não permite anexar mais que o máximo de documentos', async () => {
    const onChange = vi.fn()
    const atLimit = Array.from({ length: AI_ATTACHMENT_MAX_COUNT }, (_, i) => ({
      mime_type: 'application/pdf', data_base64: 'YWJj', filename: `doc-${i}.pdf`,
    }))
    render(<AiAttachmentsInput value={atLimit} onChange={onChange} />)

    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument()
  })
})
